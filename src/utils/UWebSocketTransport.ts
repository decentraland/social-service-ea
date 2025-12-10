import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'
import { future, IFuture } from 'fp-future'
import { randomUUID } from 'crypto'
import { AppComponents } from '../types'

export type RecognizedString =
  | string
  | ArrayBuffer
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array

export type IUWebSocketEventMap = {
  close: any
  message: RecognizedString
}

export enum UWebSocketSendResult {
  ERROR = -1,
  BACKPRESSURE = 0,
  SUCCESS = 1,
  DROPPED = 2
}

export interface IUWebSocket<T extends { isConnected: boolean; auth?: boolean }> {
  end(code?: number, shortMessage?: RecognizedString): void

  send(message: RecognizedString, isBinary?: boolean, compress?: boolean): number

  close(): void

  getUserData(): T

  getBufferedAmount(): number
}

export async function createUWebSocketTransport<T extends { isConnected: boolean; auth?: boolean }>(
  socket: IUWebSocket<T>,
  uServerEmitter: Emitter<IUWebSocketEventMap>,
  { config, logs, metrics }: Pick<AppComponents, 'config' | 'logs' | 'metrics'>
): Promise<Transport> {
  const logger = logs.getLogger('ws-transport')
  const transportId = randomUUID()

  const [
    baseMaxQueueSize = 1000,
    minQueueSize = 100,
    maxQueueSizeLimit = 5000,
    estimatedMessageSize = 1024,
    retryDelayMs = 1000,
    maxRetryAttempts = 5,
    maxBackoffDelayMs = 30000,
    maxBackpressure = 128 * 1024
  ] = await Promise.all([
    config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE'),
    config.getNumber('WS_TRANSPORT_MIN_QUEUE_SIZE'),
    config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT'),
    config.getNumber('WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE'),
    config.getNumber('WS_TRANSPORT_RETRY_DELAY_MS'),
    config.getNumber('WS_TRANSPORT_MAX_RETRY_ATTEMPTS'),
    config.getNumber('WS_TRANSPORT_MAX_BACKOFF_DELAY_MS'),
    config.getNumber('WS_MAX_BACKPRESSURE')
  ])

  // Calculate adaptive queue size based on backpressure buffer
  const adaptiveQueueSize = maxBackpressure
    ? Math.max(minQueueSize, Math.min(maxQueueSizeLimit, Math.ceil(maxBackpressure / estimatedMessageSize)))
    : baseMaxQueueSize

  // Use the smaller of baseMaxQueueSize or adaptiveQueueSize to be conservative
  const maxQueueSize = Math.min(baseMaxQueueSize, adaptiveQueueSize)

  logger.debug('Queue size configuration', {
    transportId,
    baseMaxQueueSize,
    adaptiveQueueSize,
    finalMaxQueueSize: maxQueueSize,
    maxBackpressure: maxBackpressure || 'not configured',
    estimatedMessageSize,
    minQueueSize,
    maxQueueSizeLimit
  })

  let isTransportActive = true
  let isInitialized = false

  /**
   * Safely checks if the socket is still connected.
   * Returns false if the socket is closed or if accessing it throws an error.
   * This is necessary because uWebSockets.js throws when accessing a closed socket.
   */
  function isSocketConnected(): boolean {
    if (!isTransportActive || !isInitialized) {
      return false
    }
    try {
      return socket.getUserData().isConnected
    } catch {
      // Socket is closed or invalid, accessing it throws
      return false
    }
  }

  // Simple queue for messages that couldn't be sent immediately
  const messageQueue: Array<{
    message: Uint8Array
    future: IFuture<void>
    attempts: number
  }> = []

  let isProcessing = false
  let processingTimeout: NodeJS.Timeout | null = null

  type QueuedMessage = {
    message: Uint8Array
    future: IFuture<void>
    attempts: number
  }

  function trackQueueVsBackpressureRatio() {
    try {
      const bufferedAmount = socket.getBufferedAmount()
      if (bufferedAmount > 0) {
        const ratio = messageQueue.length / (bufferedAmount / estimatedMessageSize)
        metrics.observe('ws_queue_vs_backpressure_ratio', {}, ratio)
      }
    } catch (error) {
      // Silently fail if getBufferedAmount is not available
      logger.debug('Could not track queue vs backpressure ratio', { transportId, error: (error as Error).message })
    }
  }

  async function processQueue() {
    if (isProcessing || !isTransportActive || !isInitialized) {
      return
    }

    isProcessing = true
    if (processingTimeout) {
      clearTimeout(processingTimeout)
      processingTimeout = null
    }

    try {
      while (messageQueue.length > 0 && isSocketConnected()) {
        const currentMessage = messageQueue[0]

        // Check max retries
        if (currentMessage.attempts >= maxRetryAttempts) {
          logger.warn('Message dropped after max retries', {
            transportId,
            attempts: currentMessage.attempts,
            messageSize: currentMessage.message.byteLength
          })
          // Resolve to prevent unhandled rejection crashes
          currentMessage.future.resolve()
          messageQueue.shift()
          continue
        }

        const result = processNextMessage(currentMessage)

        if (result === UWebSocketSendResult.SUCCESS || result === UWebSocketSendResult.ERROR) {
          continue
        }

        // Calculate exponential backoff delay
        const backoffDelay = Math.min(retryDelayMs * Math.pow(2, currentMessage.attempts), maxBackoffDelayMs)

        // Schedule retry with exponential backoff
        processingTimeout = setTimeout(() => {
          processingTimeout = null
          void processQueue()
        }, backoffDelay)

        // Exit the loop after scheduling retry
        return
      }
    } finally {
      isProcessing = false
    }
  }

  function processNextMessage(item: QueuedMessage): UWebSocketSendResult {
    try {
      const result = socket.send(item.message, true)

      // Track queue vs backpressure ratio for monitoring
      trackQueueVsBackpressureRatio()

      // Only record metrics for known results
      if (
        result === UWebSocketSendResult.SUCCESS ||
        result === UWebSocketSendResult.BACKPRESSURE ||
        result === UWebSocketSendResult.DROPPED
      ) {
        metrics.observe(
          'ws_message_size_bytes',
          { result: UWebSocketSendResult[result].toLowerCase() },
          item.message.byteLength
        )
      }

      switch (result) {
        case UWebSocketSendResult.SUCCESS:
          item.future.resolve()
          messageQueue.shift()
          break

        case UWebSocketSendResult.BACKPRESSURE:
          metrics.increment('ws_backpressure_events', { result: 'backpressure' })
          // Message is already queued by the underlying library, no need to retry
          item.future.resolve()
          messageQueue.shift()
          break

        case UWebSocketSendResult.DROPPED:
          // Message was dropped by the underlying library due to maxBackpressure limit.
          // We should retry this message with exponential backoff
          logger.warn('Message dropped due to backpressure limit, will retry', {
            transportId,
            messageSize: item.message.byteLength,
            attempts: item.attempts
          })
          metrics.increment('ws_backpressure_events', { result: 'dropped' })
          item.attempts++ // Increment attempts to enable exponential backoff
          break

        default:
          logger.error('Unexpected send result', {
            transportId,
            result
          })
          metrics.increment('ws_unexpected_send_result_events')
          break
      }
      return result
    } catch (error: any) {
      const errorMessage = `Failed to send message: ${error.message}`
      logger.error('Error sending message', {
        transportId,
        error: errorMessage
      })
      // Resolve instead of reject to prevent unhandled rejection crashes
      // The message is lost anyway when socket is closed
      item.future.resolve()
      events.emit('error', new Error(errorMessage))
      messageQueue.shift()
      return UWebSocketSendResult.ERROR
    }
  }

  async function send(msg: Uint8Array) {
    if (!isInitialized) {
      const error = new Error('Transport is not ready')
      logger.error('Transport is not ready', {
        transportId,
        isTransportActive: String(isTransportActive),
        isInitialized: String(isInitialized),
        isConnected: String(isSocketConnected())
      })
      return events.emit('error', error)
    }

    if (!isSocketConnected()) {
      // The transport is not active or the socket is not connected, skip message
      logger.debug('Skipping message because transport is not active or socket is not connected', {
        transportId,
        isTransportActive: String(isTransportActive),
        isConnected: String(isSocketConnected())
      })
      return
    }

    if (messageQueue.length >= maxQueueSize) {
      const error = new Error('Message queue size limit reached')
      logger.error('Queue size limit reached', {
        transportId,
        queueSize: messageQueue.length,
        maxQueueSize
      })
      return events.emit('error', error)
    }

    const messageFuture = future<void>()

    messageQueue.push({
      message: msg,
      future: messageFuture,
      attempts: 0
    })

    if (!isProcessing) {
      void processQueue()
    }

    return messageFuture
  }

  function handleMessage(message: RecognizedString) {
    if (!isTransportActive || !isInitialized) return

    if (message instanceof ArrayBuffer) {
      try {
        events.emit('message', new Uint8Array(message))
      } catch (error: any) {
        events.emit('error', new Error(`Failed to emit message: ${error.message}`))
      }
    } else {
      events.emit('error', new Error(`WebSocketTransport: Received unknown type of message`))
    }
  }

  function cleanup() {
    logger.debug('Cleaning up transport', {
      transportId,
      queueLength: messageQueue.length,
      isTransportActive: String(isTransportActive),
      isInitialized: String(isInitialized)
    })

    isTransportActive = false

    if (processingTimeout) {
      clearTimeout(processingTimeout)
      processingTimeout = null
    }

    // Resolve all queued messages to prevent unhandled rejection crashes
    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      if (item) {
        item.future.resolve()
      }
    }

    uServerEmitter.off('message', handleMessage)
  }

  const events = mitt<TransportEvents>()

  isInitialized = true
  events.emit('connect', {})

  uServerEmitter.on('message', handleMessage)

  const api: Transport = {
    ...events,
    get isConnected() {
      return isSocketConnected()
    },
    sendMessage(message: any) {
      if (!(message instanceof Uint8Array)) {
        events.emit('error', new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`))
        return
      }
      return send(message)
    },
    close() {
      cleanup()
      events.emit('close', {})
    }
  }

  return api
}

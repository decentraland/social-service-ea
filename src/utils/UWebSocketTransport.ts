import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'
import { future, IFuture } from 'fp-future'
import { IConfigComponent, ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { randomUUID } from 'crypto'
import { isErrorWithMessage } from './errors'
import { MetricsDeclaration } from '../types'

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

enum UWebSocketSendResult {
  BACKPRESSURE = 0,
  SUCCESS = 1,
  DROPPED = 2
}

export interface IUWebSocket<T extends { isConnected: boolean; auth?: boolean }> {
  end(code?: number, shortMessage?: RecognizedString): void

  send(message: RecognizedString, isBinary?: boolean, compress?: boolean): number

  close(): void

  getUserData(): T
}

export async function createUWebSocketTransport<T extends { isConnected: boolean; auth?: boolean }>(
  socket: IUWebSocket<T>,
  uServerEmitter: Emitter<IUWebSocketEventMap>,
  config: IConfigComponent,
  logs: ILoggerComponent,
  metrics: IMetricsComponent<MetricsDeclaration>
): Promise<Transport> {
  const logger = logs.getLogger('ws-transport')
  const transportId = randomUUID()

  const maxQueueSize = (await config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE')) || 1000
  const retryDelayMs = (await config.getNumber('WS_TRANSPORT_RETRY_DELAY_MS')) || 1000

  let isTransportActive = true
  let isInitialized = false

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
      while (messageQueue.length > 0 && isTransportActive && socket.getUserData().isConnected) {
        const result = processNextMessage(messageQueue[0])

        if (result === UWebSocketSendResult.SUCCESS) {
          messageQueue.shift()
          continue
        }

        // Schedule retry for backpressure or dropped messages
        processingTimeout = setTimeout(() => void processQueue(), retryDelayMs)
        return
      }
    } finally {
      isProcessing = false
    }
  }

  function processNextMessage(item: QueuedMessage): UWebSocketSendResult {
    const result = socket.send(item.message, true)

    metrics.observe(
      'ws_message_size_bytes',
      { result: UWebSocketSendResult[result].toLowerCase() },
      item.message.byteLength
    )

    logger.debug('[DEBUGGING CONNECTION] Processing queued message', {
      transportId,
      result,
      queueLength: messageQueue.length,
      messageAttempts: item.attempts,
      messageSize: item.message.byteLength
    })

    switch (result) {
      case UWebSocketSendResult.SUCCESS:
        item.future.resolve()
        break

      case UWebSocketSendResult.BACKPRESSURE:
        metrics.increment('ws_backpressure_events', { result: 'backpressure' })
        break

      case UWebSocketSendResult.DROPPED:
        metrics.increment('ws_backpressure_events', { result: 'dropped' })
        item.attempts++
        break

      default:
        logger.error('[DEBUGGING CONNECTION] Unexpected send result', {
          transportId,
          result
        })
        break
    }
    return result
  }

  async function send(msg: Uint8Array) {
    logger.debug('[DEBUGGING CONNECTION] Queueing message', {
      transportId,
      messageSize: msg.byteLength,
      queueLength: messageQueue.length,
      isTransportActive: String(isTransportActive),
      isInitialized: String(isInitialized),
      isConnected: String(socket.getUserData().isConnected)
    })

    if (!isTransportActive || !isInitialized || !socket.getUserData().isConnected) {
      const error = new Error('Transport is not ready or socket is not connected')
      logger.error('[DEBUGGING CONNECTION] Transport is not ready or socket is not connected', {
        transportId,
        isTransportActive: String(isTransportActive),
        isInitialized: String(isInitialized),
        isConnected: String(socket.getUserData().isConnected)
      })
      events.emit('error', error)
      return
    }

    if (messageQueue.length >= maxQueueSize) {
      const error = new Error('Message queue size limit reached')
      logger.error('[DEBUGGING CONNECTION] Queue size limit reached', {
        transportId,
        queueSize: messageQueue.length,
        maxQueueSize
      })
      events.emit('error', error)
      return
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
    logger.debug('[DEBUGGING CONNECTION] Handling incoming message', {
      transportId,
      messageType: message.constructor.name,
      isTransportActive: String(isTransportActive),
      isInitialized: String(isInitialized)
    })

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

  function cleanup(code: number = 1000, reason: string = 'Normal closure') {
    logger.debug('[DEBUGGING CONNECTION] Cleaning up transport', {
      transportId,
      code,
      reason,
      queueLength: messageQueue.length,
      isTransportActive: String(isTransportActive),
      isInitialized: String(isInitialized)
    })

    isTransportActive = false
    isInitialized = false

    if (processingTimeout) {
      clearTimeout(processingTimeout)
      processingTimeout = null
    }

    // Reject all queued messages
    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      if (item) {
        item.future.reject(new Error('Connection closed'))
      }
    }

    uServerEmitter.off('message', handleMessage)
    uServerEmitter.off('close', handleClose)

    try {
      if (socket.getUserData().isConnected) {
        socket.end(code, reason)
      }
    } catch (error) {
      logger.debug('[DEBUGGING CONNECTION] Error during socket end', {
        transportId,
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  function handleClose(code: number = 1000, reason: string = '') {
    cleanup(code, reason)
    events.emit('close', { code, reason })
  }

  const events = mitt<TransportEvents>()

  isInitialized = true
  events.emit('connect', {})

  uServerEmitter.on('close', handleClose)
  uServerEmitter.on('message', handleMessage)

  events.on('error', () => {
    uServerEmitter.off('message', handleMessage)
    uServerEmitter.off('close', handleClose)
  })

  const api: Transport = {
    ...events,
    get isConnected() {
      return isTransportActive && isInitialized && socket.getUserData().isConnected
    },
    sendMessage(message: any) {
      if (!(message instanceof Uint8Array)) {
        events.emit('error', new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`))
        return
      }
      return send(message)
    },
    close(code: number = 1000, reason: string = 'Client requested closure') {
      cleanup(code, reason)
      events.emit('close', { code, reason })
    }
  }

  return api
}

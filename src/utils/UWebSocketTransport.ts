import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'
import { future, IFuture } from 'fp-future'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { randomUUID } from 'crypto'
import { isErrorWithMessage } from './errors'

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
  logs: ILoggerComponent
): Promise<Transport> {
  const logger = logs.getLogger('ws-transport')
  const transportId = randomUUID()

  const maxQueueSize = (await config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE')) || 1000
  const queueDrainTimeoutInMs = (await config.getNumber('WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT_IN_MS')) || 5000

  const messageQueue: Array<{ message: Uint8Array; future: IFuture<void> }> = []
  let queueDrainTimeout: NodeJS.Timeout | null = null

  let isTransportActive = true
  let isInitialized = false
  let isProcessing = false
  let queueProcessingTimeout: NodeJS.Timeout | null = null

  // Process messages in batches of 100
  const BATCH_SIZE = 100
  let processedInBatch = 0

  async function processQueue() {
    if (isProcessing || !isTransportActive || !isInitialized) {
      logger.debug('[DEBUGGING CONNECTION] Queue processing skipped', {
        transportId,
        isProcessing: String(isProcessing),
        isTransportActive: String(isTransportActive),
        isInitialized: String(isInitialized),
        queueLength: messageQueue.length
      })
      return
    }

    logger.debug('[DEBUGGING CONNECTION] Processing queue', {
      transportId,
      queueLength: messageQueue.length
    })

    isProcessing = true

    if (queueProcessingTimeout) {
      clearTimeout(queueProcessingTimeout)
      queueProcessingTimeout = null
    }

    try {
      while (messageQueue.length > 0 && isTransportActive && socket.getUserData().isConnected) {
        const item = messageQueue[0]
        try {
          const result = socket.send(item.message, true)
          if (result === 0) {
            break
          }

          item.future.resolve()
          messageQueue.shift()

          // Yield to event loop after processing BATCH_SIZE messages
          processedInBatch++
          if (processedInBatch >= BATCH_SIZE) {
            processedInBatch = 0
            await new Promise((resolve) => setImmediate(resolve))
          }
        } catch (error: any) {
          const errorMessage = `Failed to send message: ${error.message}`
          item.future.reject(new Error(errorMessage))
          messageQueue.shift()
          events.emit('error', new Error(errorMessage))
          return
        }
      }
    } finally {
      isProcessing = false

      if (messageQueue.length > 0 && isTransportActive && socket.getUserData().isConnected) {
        queueProcessingTimeout = setTimeout(() => {
          void processQueue()
        }, 1000)
      } else if (messageQueue.length === 0 && queueDrainTimeout) {
        // Clear queue drain timeout if queue is empty
        clearTimeout(queueDrainTimeout)
        queueDrainTimeout = null
      }
    }
  }

  async function send(msg: Uint8Array) {
    logger.debug('[DEBUGGING CONNECTION] Attempting to send message', {
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
      const error = new Error('Queue size limit reached')
      events.emit('error', error)
      return
    }

    const messageFuture = future<void>()
    messageQueue.push({ message: msg, future: messageFuture })

    // Set queue drain timeout if this is the first message
    if (messageQueue.length === 1) {
      if (queueDrainTimeout) {
        clearTimeout(queueDrainTimeout)
      }

      queueDrainTimeout = setTimeout(() => {
        if (messageQueue.length > 0) {
          const error = new Error('Queue drain timeout')
          while (messageQueue.length > 0) {
            const item = messageQueue.shift()
            item?.future.reject(error)
          }
          events.emit('error', error)
        }
      }, queueDrainTimeoutInMs)
    }

    void processQueue()
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

    if (queueProcessingTimeout) {
      clearTimeout(queueProcessingTimeout)
      queueProcessingTimeout = null
    }

    if (queueDrainTimeout) {
      clearTimeout(queueDrainTimeout)
      queueDrainTimeout = null
    }

    // Reject all queued messages
    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      const error = new Error('Connection closed')
      item?.future.reject(error)
      events.emit('error', error)
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

import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'
import { future, IFuture } from 'fp-future'
import { IConfigComponent } from '@well-known-components/interfaces'

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
  config: IConfigComponent
): Promise<Transport> {
  const maxQueueSize = (await config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE')) || 1000
  const queueDrainTimeout = (await config.getNumber('WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT')) || 5000

  const messageQueue: Array<{ message: Uint8Array; future: IFuture<void> }> = []

  let isTransportActive = true
  let isInitialized = false
  let isProcessing = false
  let queueProcessingTimeout: NodeJS.Timeout | null = null

  async function processQueue() {
    if (isProcessing || !isTransportActive || !isInitialized) return
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
            // Send failed, socket might be closed
            item.future.reject(new Error('Failed to send message: Socket closed'))
            messageQueue.shift()
            cleanup()
            return
          }
          item.future.resolve()
          messageQueue.shift()
        } catch (error: any) {
          item.future.reject(new Error(`Failed to send message: ${error.message}`))
          messageQueue.shift()
          cleanup()
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      isProcessing = false

      if (messageQueue.length > 0) {
        queueProcessingTimeout = setTimeout(() => {
          void processQueue()
        }, 1000)
      }
    }
  }

  async function send(msg: Uint8Array) {
    if (!isTransportActive || !isInitialized || !socket.getUserData().isConnected) {
      throw new Error('Transport is not ready or socket is not connected')
    }

    if (messageQueue.length >= maxQueueSize) {
      const drainFuture = future<void>()
      const timeout = setTimeout(() => {
        drainFuture.reject(new Error('Queue drain timeout'))
      }, queueDrainTimeout)

      try {
        await drainFuture
      } finally {
        clearTimeout(timeout)
      }
    }

    const messageFuture = future<void>()
    messageQueue.push({ message: msg, future: messageFuture })
    void processQueue()
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

  function cleanup(code: number = 1000, reason: string = 'Normal closure') {
    if (queueProcessingTimeout) {
      clearTimeout(queueProcessingTimeout)
      queueProcessingTimeout = null
    }

    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      item?.future.reject(new Error('Connection closed'))
    }

    isTransportActive = false
    isInitialized = false
    uServerEmitter.off('message', handleMessage)
    uServerEmitter.off('close', handleClose)

    try {
      if (socket.getUserData().isConnected) {
        socket.end(code, reason)
      }
    } catch (error) {
      // Ignore error socket already closed
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

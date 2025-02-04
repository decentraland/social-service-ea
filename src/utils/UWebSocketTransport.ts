import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'
import { future, IFuture } from 'fp-future'

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

export interface IUWebSocket<T extends { isConnected: boolean }> {
  end(code?: number, shortMessage?: RecognizedString): void

  send(message: RecognizedString, isBinary?: boolean, compress?: boolean): number

  close(): void

  getUserData(): T
}

export type WebSocketTransportConfig = {
  maxQueueSize?: number
  queueDrainTimeout?: number
}

const DEFAULT_CONFIG: Required<WebSocketTransportConfig> = {
  maxQueueSize: 1000,
  queueDrainTimeout: 5000
}

export function createUWebSocketTransport<T extends { isConnected: boolean }>(
  socket: IUWebSocket<T>,
  uServerEmitter: Emitter<IUWebSocketEventMap>,
  config: WebSocketTransportConfig = {}
): Transport {
  const { maxQueueSize, queueDrainTimeout } = { ...DEFAULT_CONFIG, ...config }
  let isTransportActive = true
  const messageQueue: Array<{ message: Uint8Array; future: IFuture<void> }> = []
  let isProcessing = false
  let isInitialized = false

  async function processQueue() {
    if (isProcessing || !isTransportActive || !isInitialized) return
    isProcessing = true

    while (messageQueue.length > 0 && isTransportActive && socket.getUserData().isConnected) {
      const item = messageQueue[0]
      try {
        socket.send(item.message, true)
        item.future.resolve()
        messageQueue.shift()
      } catch (error: any) {
        item.future.reject(new Error(`Failed to send message: ${error.message}`))
        messageQueue.shift()
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    isProcessing = false
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
      events.emit('error', new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`))
    }
  }

  function cleanup() {
    isTransportActive = false
    isInitialized = false
    uServerEmitter.off('message', handleMessage)
    uServerEmitter.off('close', handleClose)
  }

  function handleClose() {
    cleanup()
    events.emit('close', {})
  }

  const events = mitt<TransportEvents>()

  // Wait for connection to be ready before initializing
  setImmediate(() => {
    if (socket.getUserData().isConnected) {
      isInitialized = true
      events.emit('connect', {})
    }
  })

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
    close() {
      cleanup()
      try {
        socket.close()
      } catch (error: any) {
        // Ignore error socket already closed
      }
    }
  }

  return api
}

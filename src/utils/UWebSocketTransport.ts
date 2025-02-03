import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'

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

export function UWebSocketTransport<T extends { isConnected: boolean }>(
  socket: IUWebSocket<T>,
  uServerEmitter: Emitter<IUWebSocketEventMap>
): Transport {
  let isTransportActive = true

  function send(msg: Uint8Array | ArrayBuffer | SharedArrayBuffer) {
    if (!isTransportActive || !socket.getUserData().isConnected) {
      events.emit('error', new Error('Transport is not active or socket is not connected'))
      return
    }

    try {
      socket.send(msg, true)
    } catch (error: any) {
      events.emit('error', new Error(`Failed to send message: ${error.message}`))
    }
  }

  function handleMessage(message: RecognizedString) {
    if (!isTransportActive) return

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
    uServerEmitter.off('message', handleMessage)
    uServerEmitter.off('close', handleClose)
  }

  function handleClose() {
    cleanup()
    events.emit('close', {})
  }

  const events = mitt<TransportEvents>()

  uServerEmitter.on('close', handleClose)
  uServerEmitter.on('message', handleMessage)

  setImmediate(() => {
    if (socket.getUserData().isConnected) {
      events.emit('connect', {})
    }
  })

  const api: Transport = {
    ...events,
    get isConnected() {
      return isTransportActive && socket.getUserData().isConnected
    },
    sendMessage(message: any) {
      if (!(message instanceof Uint8Array)) {
        events.emit('error', new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`))
        return
      }
      send(message)
    },
    close() {
      cleanup()
      socket.close()
    }
  }

  return api
}

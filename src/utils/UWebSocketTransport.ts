import { Transport, TransportEvents } from '@dcl/rpc'
import mitt, { Emitter } from 'mitt'

export const defer = Promise.prototype.then.bind(Promise.resolve())

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
  const queue: Uint8Array[] = []

  function flush() {
    for (const $ of queue) {
      send($)
      queue.length = 0
    }
  }

  function send(msg: string | Uint8Array | ArrayBuffer | SharedArrayBuffer) {
    if (msg instanceof Uint8Array || msg instanceof ArrayBuffer || msg instanceof SharedArrayBuffer) {
      socket.send(msg, true)
    } else {
      throw new Error(`WebSocketTransport only accepts Uint8Array`)
    }
  }

  const events = mitt<TransportEvents>()

  uServerEmitter.on('close', () => {
    events.emit('close', {})
  })

  uServerEmitter.on('message', (message) => {
    if (message instanceof ArrayBuffer) {
      events.emit('message', new Uint8Array(message))
    } else {
      throw new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`)
    }
  })

  // socket already connected at this point
  void defer(() => events.emit('connect', {}))
  void defer(() => flush())

  const api: Transport = {
    ...events,
    get isConnected() {
      return socket.getUserData().isConnected
    },
    sendMessage(message: any) {
      if (message instanceof Uint8Array) {
        if (true) {
          send(message)
        } else {
        }
      } else {
        throw new Error(`WebSocketTransport: Received unknown type of message, expecting Uint8Array`)
      }
    },
    close() {
      socket.close()
    }
  }

  return api
}

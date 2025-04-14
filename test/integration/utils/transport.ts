import WebSocket, { MessageEvent } from 'ws'
import mitt, { Emitter } from 'mitt'
import type { TransportEvents } from '@dcl/rpc'

export type Transport = Pick<Emitter<TransportEvents>, 'on' | 'emit' | 'off'> & {
  /** sendMessage is used to send a message through the transport */
  sendMessage(message: Uint8Array): void
  close(): void
  readonly isConnected: boolean
}

export function createWebSocketTransport(url: string): Transport {
  let socket: WebSocket | undefined
  let isClosing = false
  let isConnected = false
  const events = mitt<TransportEvents>()

  const connect = () => {
    if (socket || isClosing) {
      return // Don't create multiple connections or during cleanup
    }

    socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'

    socket.addEventListener(
      'open',
      () => {
        isConnected = true
        if (!isClosing) {
          events.emit('connect', {})
        }
      },
      { once: true }
    )

    socket.addEventListener(
      'close',
      (event) => {
        isConnected = false
        if (!isClosing) {
          events.emit('close', {})
        }
        socket = undefined
      },
      { once: true }
    )

    socket.addEventListener('error', (err: any) => {
      if (!isClosing) {
        events.emit('error', err)
      }
    })

    socket.addEventListener('message', (message: MessageEvent) => {
      if (!isClosing && message.data instanceof ArrayBuffer) {
        events.emit('message', new Uint8Array(message.data))
      }
    })
  }

  connect()

  return {
    ...events,

    get isConnected(): boolean {
      return isConnected && socket?.readyState === WebSocket.OPEN
    },

    sendMessage(message: Uint8Array): void {
      if (!this.isConnected) {
        throw new Error('WebSocket is not connected')
      }
      socket!.send(message)
    },

    close(): void {
      isClosing = true
      if (socket) {
        socket.close()
        socket = undefined
      }
      events.all.clear()
      isConnected = false
      isClosing = false
    }
  }
}

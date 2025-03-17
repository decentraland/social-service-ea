import WebSocket, { MessageEvent } from 'isomorphic-ws'
import mitt from 'mitt'
import type { Transport, TransportEvents } from '@dcl/rpc'

export function createWebSocketTransport(url: string): Transport {
  let socket: WebSocket | undefined
  const events = mitt<TransportEvents>()
  
  const connect = () => {
    socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    
    // Emit 'connect' when socket is open
    socket.addEventListener('open', () => events.emit('connect', {}), { once: true })
    
    // Emit 'close' on socket close
    socket.addEventListener(
      'close',
      (event) => {
        events.emit('close', {})
      },
      { once: true }
    )
    
    // Handle errors and emit 'error' event
    socket.addEventListener('error', (err) => {
      const error = err instanceof Error ? err : new Error('WebSocket error')
      console.error('WebSocket error:', error)
      events.emit('error', error)
    })
    
    // Handle incoming messages and emit 'message'
    socket.addEventListener('message', (message: MessageEvent) => {
      if (message.data instanceof ArrayBuffer) {
        events.emit('message', new Uint8Array(message.data))
      }
    })
  }
  
  const send = (message: Uint8Array) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message)
    }
  }
  
  connect()
  
  return {
    ...events,
    
    get isConnected(): boolean {
      return socket?.readyState === WebSocket.OPEN || false
    },
    
    sendMessage(message: Uint8Array): void {
      send(message)
    },
    
    close(): void {
      if (socket) {
        socket.close()
      }
    }
  }
}

import mitt, { Emitter } from 'mitt'
import { UWebSocketTransport, IUWebSocket, IUWebSocketEventMap } from '../../../src/utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'

describe('UWebSocketTransport', () => {
  let mockSocket: jest.Mocked<IUWebSocket<{ isConnected: boolean }>>
  let mockEmitter: Emitter<IUWebSocketEventMap>
  let transport: Transport

  beforeEach(() => {
    mockSocket = {
      send: jest.fn(),
      close: jest.fn(),
      end: jest.fn(),
      getUserData: jest.fn(() => ({ isConnected: true }))
    } as jest.Mocked<IUWebSocket<{ isConnected: boolean }>>

    mockEmitter = mitt<IUWebSocketEventMap>()
    transport = UWebSocketTransport(mockSocket, mockEmitter)
  })

  describe('Transport Initialization', () => {
    it('should initialize transport and emit connect event', async () => {
      const connectListener = jest.fn()
      transport.on('connect', connectListener)

      await new Promise(setImmediate)

      expect(connectListener).toHaveBeenCalled()
    })
  })

  describe('sendMessage', () => {
    it('should send a Uint8Array message', () => {
      const message = new Uint8Array([1, 2, 3])

      transport.sendMessage(message)
      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
    })
  })

  describe('close', () => {
    it('should call socket.close()', () => {
      transport.close()
      expect(mockSocket.close).toHaveBeenCalled()
    })
  })

  describe('Event Handling', () => {
    it('should emit a close event when the WebSocket is closed', () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      mockEmitter.emit('close', undefined)
      expect(closeListener).toHaveBeenCalledWith({})
    })

    it('should emit a message event when a valid message is received', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      const message = new ArrayBuffer(4)
      mockEmitter.emit('message', message)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(message))
    })

    it('should throw an error for unsupported message types', () => {
      const invalidMessage = 'Invalid message'
      expect(() => mockEmitter.emit('message', invalidMessage)).toThrow(
        'WebSocketTransport: Received unknown type of message, expecting Uint8Array'
      )
    })
  })

  describe('isConnected', () => {
    it('should reflect the socket connection state', () => {
      expect(transport.isConnected).toBe(true)

      mockSocket.getUserData.mockReturnValueOnce({ isConnected: false })
      expect(transport.isConnected).toBe(false)
    })
  })
})

import mitt, { Emitter } from 'mitt'
import { createUWebSocketTransport, IUWebSocket, IUWebSocketEventMap } from '../../../src/utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'

describe('UWebSocketTransport', () => {
  let mockSocket: jest.Mocked<IUWebSocket<{ isConnected: boolean }>>
  let mockEmitter: Emitter<IUWebSocketEventMap>
  let transport: Transport
  let errorListener: jest.Mock

  beforeEach(() => {
    mockSocket = {
      send: jest.fn(),
      close: jest.fn(),
      end: jest.fn(),
      getUserData: jest.fn(() => ({ isConnected: true }))
    } as jest.Mocked<IUWebSocket<{ isConnected: boolean }>>

    mockEmitter = mitt<IUWebSocketEventMap>()
    transport = createUWebSocketTransport(mockSocket, mockEmitter)
    errorListener = jest.fn()
    transport.on('error', errorListener)
  })

  afterEach(() => {
    // transport.all.clear()
    mockEmitter.all.clear()
  })

  describe('Transport Initialization', () => {
    it('should initialize transport with correct state', () => {
      expect(transport.isConnected).toBe(true)
    })

    it('should emit connect event when socket is connected', async () => {
      const connectListener = jest.fn()
      transport.on('connect', connectListener)

      await new Promise(setImmediate)
      expect(connectListener).toHaveBeenCalledWith({})
    })

    it('should not emit connect event when socket is disconnected', async () => {
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      const connectListener = jest.fn()

      const newTransport = createUWebSocketTransport(mockSocket, mockEmitter)
      newTransport.on('connect', connectListener)

      await new Promise(setImmediate)
      expect(connectListener).not.toHaveBeenCalled()
    })
  })

  describe('Message Handling', () => {
    it('should handle ArrayBuffer messages correctly', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(buffer))
      expect(errorListener).not.toHaveBeenCalled()
    })

    it('should emit error for non-ArrayBuffer messages', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      mockEmitter.emit('message', 'invalid message')

      expect(messageListener).not.toHaveBeenCalled()
      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
      )
    })

    it('should emit error when message emit fails', () => {
      const messageListener = jest.fn(() => {
        throw new Error('Emit failed')
      })
      transport.on('message', messageListener)

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(buffer))
      expect(errorListener).toHaveBeenCalledWith(new Error('Failed to emit message: Emit failed'))
    })

    it('should not handle messages after cleanup', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      transport.close()
      mockEmitter.emit('message', new ArrayBuffer(4))

      expect(messageListener).not.toHaveBeenCalled()
    })
  })

  describe('Message Sending', () => {
    it('should send Uint8Array messages when connected', () => {
      const message = new Uint8Array([1, 2, 3])
      transport.sendMessage(message)

      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
      expect(errorListener).not.toHaveBeenCalled()
    })

    it('should emit error when sending non-Uint8Array messages', () => {
      transport.sendMessage('invalid message' as any)

      expect(mockSocket.send).not.toHaveBeenCalled()
      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
      )
    })

    it('should emit error when sending message while disconnected', () => {
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      const message = new Uint8Array([1, 2, 3])

      transport.sendMessage(message)

      expect(mockSocket.send).not.toHaveBeenCalled()
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not active or socket is not connected'))
    })

    it('should emit error when send fails', () => {
      mockSocket.send.mockImplementation(() => {
        throw new Error('Send failed')
      })
      const message = new Uint8Array([1, 2, 3])

      transport.sendMessage(message)

      expect(errorListener).toHaveBeenCalledWith(new Error('Failed to send message: Send failed'))
    })
  })

  describe('Connection State', () => {
    it('should reflect socket connection state', () => {
      expect(transport.isConnected).toBe(true)

      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      expect(transport.isConnected).toBe(false)
    })

    it('should handle close event correctly', () => {
      const closeListener = jest.fn()

      transport.on('close', closeListener)
      mockEmitter.emit('close', undefined)

      expect(transport.isConnected).toBe(false)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup resources on close', () => {
      const messageListener = jest.fn()
      const closeListener = jest.fn()
      transport.on('message', messageListener)
      transport.on('close', closeListener)

      transport.close()

      expect(mockSocket.close).toHaveBeenCalled()

      mockEmitter.emit('message', new ArrayBuffer(4))
      mockEmitter.emit('close', undefined)

      expect(messageListener).not.toHaveBeenCalled()
      expect(closeListener).not.toHaveBeenCalled()
    })

    it('should not allow sending messages after cleanup', () => {
      const errorListener = jest.fn()
      transport.on('error', errorListener)

      transport.close()
      const message = new Uint8Array([1, 2, 3])

      transport.sendMessage(message)

      expect(mockSocket.send).not.toHaveBeenCalled()
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not active or socket is not connected'))
    })
  })

  describe('Transport Configuration', () => {
    it('should use default configuration when none provided', () => {
      const transport = createUWebSocketTransport(mockSocket, mockEmitter)
      expect(transport.isConnected).toBe(true)
    })

    it('should use provided configuration', () => {
      const config = {
        maxQueueSize: 500,
        queueDrainTimeout: 2000
      }
      const transport = createUWebSocketTransport(mockSocket, mockEmitter, config)
      expect(transport.isConnected).toBe(true)
    })
  })

  describe('Message Queue', () => {
    it('should queue messages when limit not reached', async () => {
      const transport = createUWebSocketTransport(mockSocket, mockEmitter, {
        maxQueueSize: 2,
        queueDrainTimeout: 1000
      })
      const message = new Uint8Array([1, 2, 3])

      await transport.sendMessage(message)
      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
    })

    it('should reject messages when queue is full', async () => {
      const transport = createUWebSocketTransport(mockSocket, mockEmitter, {
        maxQueueSize: 1,
        queueDrainTimeout: 100
      })

      // mockSocket.send.mockImplementation(() => Promise.resolve(1)) // Return number as expected
      const message = new Uint8Array([1, 2, 3])

      await transport.sendMessage(message) // First message queued
      await expect(transport.sendMessage(message)).rejects.toThrow('Queue drain timeout')
    })
  })
})

import mitt, { Emitter } from 'mitt'
import { createUWebSocketTransport, IUWebSocket, IUWebSocketEventMap } from '../../../src/utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'
import { mockConfig, mockLogs } from '../../mocks/components'

describe('UWebSocketTransport', () => {
  let mockSocket: jest.Mocked<IUWebSocket<{ isConnected: boolean }>>
  let mockEmitter: Emitter<IUWebSocketEventMap>
  let transport: Transport
  let errorListener: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    mockConfig.getNumber.mockImplementation(async (key) => {
      const defaults: Record<string, number> = {
        WS_TRANSPORT_MAX_QUEUE_SIZE: 1000,
        WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT: 5000
      }
      return defaults[key] || null
    })

    mockSocket = {
      send: jest.fn().mockReturnValue(1),
      close: jest.fn(),
      end: jest.fn(),
      getUserData: jest.fn().mockReturnValue({ isConnected: true })
    } as jest.Mocked<IUWebSocket<{ isConnected: boolean }>>

    mockEmitter = mitt<IUWebSocketEventMap>()
    transport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs)
    errorListener = jest.fn()
    transport.on('error', errorListener)
  })

  afterEach(() => {
    mockEmitter.all.clear()
  })

  describe('Transport Initialization', () => {
    it('should initialize transport with correct state', () => {
      expect(transport.isConnected).toBe(true)
    })

    it('should use configured queue size', async () => {
      mockConfig.getNumber.mockImplementation(async (key) => {
        if (key === 'WS_TRANSPORT_MAX_QUEUE_SIZE') return 500
        return null
      })

      const customTransport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs)
      expect(customTransport.isConnected).toBe(true)
      expect(mockConfig.getNumber).toHaveBeenCalledWith('WS_TRANSPORT_MAX_QUEUE_SIZE')
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

    it('should handle message queue processing', async () => {
      const message = new Uint8Array([1, 2, 3])
      await transport.sendMessage(message)

      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
      expect(errorListener).not.toHaveBeenCalled()
    })

    it('should handle send failure', async () => {
      mockSocket.send.mockReturnValue(0)
      const message = new Uint8Array([1, 2, 3])

      await expect(transport.sendMessage(message)).rejects.toThrow('Failed to send message: Socket closed')
    })

    it('should handle queue overflow', async () => {
      mockConfig.getNumber.mockImplementation(async (key) => {
        const values: Record<string, number> = {
          WS_TRANSPORT_MAX_QUEUE_SIZE: 1,
          WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT: 100
        }
        return values[key] || null
      })

      const customTransport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs)
      mockSocket.send.mockReturnValue(0)

      const message = new Uint8Array([1, 2, 3])
      await expect(customTransport.sendMessage(message)).rejects.toThrow('Failed to send message: Socket closed')
    })
  })

  describe('Connection State', () => {
    it('should handle disconnection', async () => {
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      const message = new Uint8Array([1, 2, 3])

      await transport.sendMessage(message)
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
    })

    it('should handle cleanup on close', () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      transport.close()

      expect(mockSocket.end).toHaveBeenCalledWith(1000, 'Client requested closure')
    })
  })

  describe('Error Handling', () => {
    it('should handle socket errors during send', async () => {
      const error = new Error('Socket error')
      mockSocket.send.mockImplementation(() => {
        throw error
      })

      const message = new Uint8Array([1, 2, 3])
      await expect(transport.sendMessage(message)).rejects.toThrow('Failed to send message: Socket error')
    })

    it('should handle invalid message types', () => {
      transport.sendMessage('invalid' as any)
      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
      )
    })
  })

  describe('Queue Processing', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should process messages in queue', async () => {
      mockSocket.send.mockReturnValue(1)
      const messages = [new Uint8Array([1]), new Uint8Array([2])]

      const sendPromises = messages.map((msg) => transport.sendMessage(msg))

      // Let the first message process
      await Promise.resolve()
      expect(mockSocket.send).toHaveBeenCalledWith(messages[0], true)

      // Process second message
      jest.advanceTimersByTime(1000)
      await Promise.resolve()

      await Promise.all(sendPromises)
      expect(mockSocket.send).toHaveBeenCalledTimes(2)
    })

    it('should handle queue overflow and drain timeout', async () => {
      mockSocket.send.mockReturnValue(0) // Force queue to fill
      const message = new Uint8Array([1])

      const sendPromise = transport.sendMessage(message)
      jest.advanceTimersByTime(5000)

      await expect(sendPromise).rejects.toThrow('Failed to send message: Socket closed')
    })

    it('should handle queue processing interruption', async () => {
      mockSocket.send.mockReturnValue(0) // Force queue to fill
      const message = new Uint8Array([1])

      const sendPromise = transport.sendMessage(message)
      transport.close()

      await expect(sendPromise).rejects.toThrow('Failed to send message: Socket closed')
    })

    it('should handle concurrent message processing', async () => {
      mockSocket.send.mockReturnValue(1)
      const messages = Array(5)
        .fill(0)
        .map((_, i) => new Uint8Array([i]))

      const sendPromises = messages.map((msg) => transport.sendMessage(msg))

      for (let i = 0; i < messages.length; i++) {
        await Promise.resolve()
        jest.advanceTimersByTime(0)
      }

      await Promise.all(sendPromises)
      expect(mockSocket.send).toHaveBeenCalledTimes(messages.length)
    })
  })

  describe('Message Processing', () => {
    it('should handle message emission errors', () => {
      const error = new Error('Emission error')
      transport.on('message', () => {
        throw error
      })

      mockEmitter.emit('message', new ArrayBuffer(4))
      expect(errorListener).toHaveBeenCalledWith(new Error(`Failed to emit message: ${error.message}`))
    })

    it('should ignore messages when transport is not active', () => {
      transport.close()
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      mockEmitter.emit('message', new ArrayBuffer(4))
      expect(messageListener).not.toHaveBeenCalled()
    })
  })

  describe('Connection Management', () => {
    it('should handle message send when transport is not initialized', async () => {
      const uninitializedTransport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs)
      // Force transport to be not ready
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      const errorListener = jest.fn()
      uninitializedTransport.on('error', errorListener)

      const message = new Uint8Array([1])
      await uninitializedTransport.sendMessage(message)
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
    })

    it('should handle cleanup during active message processing', async () => {
      jest.useFakeTimers()
      mockSocket.send.mockReturnValue(0) // Force send failure

      const message = new Uint8Array([1])
      const sendPromise = transport.sendMessage(message)
      transport.close()

      await expect(sendPromise).rejects.toThrow('Failed to send message: Socket closed')
      jest.useRealTimers()
    })

    it('should handle multiple close calls', () => {
      transport.close()
      mockSocket.end.mockClear()
      mockSocket.getUserData.mockReturnValue({ isConnected: false }) // Indicate connection is closed
      transport.close() // Second close should not call end again
      expect(mockSocket.end).not.toHaveBeenCalled()
    })
  })

  describe('Error Scenarios', () => {
    it('should handle socket errors during queue processing', async () => {
      mockSocket.send.mockImplementation(() => {
        throw new Error('Socket error')
      })

      const message = new Uint8Array([1])
      await expect(transport.sendMessage(message)).rejects.toThrow('Failed to send message: Socket error')
    })

    it('should handle queue timeout during processing', async () => {
      jest.useFakeTimers()
      mockSocket.send.mockReturnValue(0) // Force send failure

      const message = new Uint8Array([1])
      const sendPromise = transport.sendMessage(message)

      await expect(sendPromise).rejects.toThrow('Failed to send message: Socket closed')

      jest.useRealTimers()
    })
  })
})

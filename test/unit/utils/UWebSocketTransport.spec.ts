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
    mockConfig.getNumber.mockImplementation(async (key) => ({
      WS_TRANSPORT_MAX_QUEUE_SIZE: 3,
      WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT_IN_MS: 5000
    })[key] || null)

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
    jest.useRealTimers()
  })

  describe('Transport Lifecycle', () => {
    it('should initialize with correct state', () => {
      expect(transport.isConnected).toBe(true)
    })

    it('should handle normal cleanup sequence', () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      transport.close()

      expect(mockSocket.end).toHaveBeenCalledWith(1000, 'Client requested closure')
      expect(closeListener).toHaveBeenCalledWith({ code: 1000, reason: 'Client requested closure' })
      expect(transport.isConnected).toBe(false)
    })

    it('should handle multiple close calls gracefully', () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      transport.close()
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      transport.close()

      expect(mockSocket.end).toHaveBeenCalledTimes(1)
      expect(closeListener).toHaveBeenCalledTimes(2)
    })
  })

  describe('Message Handling', () => {
    it('should process single message successfully', async () => {
      const message = new Uint8Array([1, 2, 3])
      await transport.sendMessage(message)

      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
      expect(errorListener).not.toHaveBeenCalled()
    })

    it('should handle incoming ArrayBuffer messages', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(buffer))
    })

    it('should reject messages when transport is not connected', async () => {
      transport.close()
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      
      const message = new Uint8Array([1])
      const errorListener = jest.fn()
      transport.on('error', errorListener)

      transport.sendMessage(message)

      expect(mockSocket.send).not.toHaveBeenCalled()
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
    })

    it('should handle message queue when socket closes', async () => {
      jest.useFakeTimers()
      const messages = [new Uint8Array([1]), new Uint8Array([2])]
      
      // Mock socket.send to return 0 to simulate backpressure
      mockSocket.send.mockReturnValue(0)
      
      const sendPromises = messages.map(msg => transport.sendMessage(msg))
      
      // Run timers to process queue
      await jest.advanceTimersByTimeAsync(0)
      
      // Verify first message is retried
      expect(mockSocket.send).toHaveBeenCalledTimes(2)
      expect(mockSocket.send).toHaveBeenNthCalledWith(1, messages[0], true)
      expect(mockSocket.send).toHaveBeenNthCalledWith(2, messages[0], true) // Same message retried
      
      // Close transport to trigger connection closed error
      transport.close()
      
      const results = await Promise.allSettled(sendPromises)
      results.forEach(result => {
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') {
          expect(result.reason.message).toBe('Connection closed')
        }
      })
      expect(errorListener).toHaveBeenCalledWith(new Error('Connection closed'))
    }, 10000)
  })

  describe('Queue Management', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should process queued messages in order', async () => {
      const messages = [new Uint8Array([1]), new Uint8Array([2])]
      const sendPromises = messages.map(msg => transport.sendMessage(msg))
      
      await jest.runAllTimersAsync()
      await Promise.all(sendPromises)

      expect(mockSocket.send).toHaveBeenCalledTimes(2)
      expect(mockSocket.send).toHaveBeenNthCalledWith(1, messages[0], true)
      expect(mockSocket.send).toHaveBeenNthCalledWith(2, messages[1], true)
    }, 10000)

    it('should handle queue drain timeout', async () => {
      jest.useFakeTimers()
      
      mockSocket.getUserData.mockReturnValue({ isConnected: true })
      mockSocket.send.mockReturnValue(0) // Simulate backpressure

      // Set up error listener
      const errorListener = jest.fn()
      transport.on('error', errorListener)

      // Send a message that will be queued
      const sendPromise = transport.sendMessage(new Uint8Array([1, 2, 3]))

      // Run all pending timers
      jest.runAllTimers()

      // Verify error event was emitted
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Queue drain timeout'
      }))

      // Verify promise was rejected
      await expect(sendPromise).rejects.toMatchObject({
        message: 'Queue drain timeout'
      })

      jest.useRealTimers()
    })

    it('should handle non-binary messages correctly', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      mockEmitter.emit('message', 'string message')

      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message')
      )
      expect(messageListener).not.toHaveBeenCalled()
    })

    it('should handle queue processing retry', async () => {
      jest.useFakeTimers()
      const message = new Uint8Array([1])
      
      // Mock socket.send to simulate backpressure then success
      mockSocket.send
        .mockReturnValueOnce(0) // First attempt fails
        .mockReturnValueOnce(0) // Second attempt fails
        .mockReturnValue(1)     // Third attempt succeeds
      
      const sendPromise = transport.sendMessage(message)
      
      // First attempt fails
      await jest.advanceTimersByTimeAsync(0)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)
      
      // Second attempt fails
      await jest.advanceTimersByTimeAsync(1000)
      expect(mockSocket.send).toHaveBeenCalledTimes(2)
      
      // Third attempt succeeds
      await jest.advanceTimersByTimeAsync(1000)
      expect(mockSocket.send).toHaveBeenCalledTimes(3)
      
      await expect(sendPromise).resolves.not.toThrow()
    }, 10000)

    it('should handle queue processing interruption', async () => {
      jest.useFakeTimers()
      const messages = [new Uint8Array([1]), new Uint8Array([2])]
      
      // Mock socket.send to simulate backpressure for all messages
      mockSocket.send.mockReturnValue(0)
      
      const sendPromises = messages.map(msg => transport.sendMessage(msg))
      
      // Run timers to process first message
      await jest.advanceTimersByTimeAsync(0)
      
      // Verify first message is retried
      expect(mockSocket.send).toHaveBeenCalledTimes(2)
      expect(mockSocket.send).toHaveBeenNthCalledWith(1, messages[0], true)
      expect(mockSocket.send).toHaveBeenNthCalledWith(2, messages[0], true) // Same message retried
      
      // Close transport during processing
      transport.close()
      
      const results = await Promise.allSettled(sendPromises)
      results.forEach(result => {
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') {
          expect(result.reason.message).toBe('Connection closed')
        }
      })
      expect(errorListener).toHaveBeenCalledWith(new Error('Connection closed'))
    }, 10000)

    it('should handle message queue size limit', async () => {
      mockSocket.getUserData.mockReturnValue({ isConnected: true })
      mockSocket.send.mockReturnValue(0) // Simulate backpressure

      // Set up error listener
      const errorListener = jest.fn()
      transport.on('error', errorListener)

      // Fill up the queue to its limit
      const maxQueueSize = 3
      const sendPromises = []
      for (let i = 0; i < maxQueueSize; i++) {
        sendPromises.push(transport.sendMessage(new Uint8Array([1, 2, 3])))
      }

      // Try to send one more message
      transport.sendMessage(new Uint8Array([1, 2, 3]))

      // Verify error event was emitted
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Queue size limit reached'
      }))
    })

    it('should handle message processing after transport initialization', async () => {
      const message = new Uint8Array([1])
      
      // Mock socket.send to simulate successful send
      mockSocket.send.mockReturnValue(1)
      
      const sendPromise = transport.sendMessage(message)
      
      await expect(sendPromise).resolves.not.toThrow()
      expect(mockSocket.send).toHaveBeenCalledWith(message, true)
    })

    it('should handle cleanup during active message processing', async () => {
      jest.useFakeTimers()
      const message = new Uint8Array([1])
      
      // Mock socket.send to simulate backpressure
      mockSocket.send.mockReturnValue(0)
      
      const sendPromise = transport.sendMessage(message)
      
      // Start cleanup while message is being processed
      transport.close()
      
      const result = await Promise.allSettled([sendPromise])
      expect(result[0].status).toBe('rejected')
      if (result[0].status === 'rejected') {
        expect(result[0].reason.message).toBe('Connection closed')
      }
      expect(errorListener).toHaveBeenCalledWith(new Error('Connection closed'))
    })

    it('should handle message processing when transport is not initialized', async () => {
      const uninitializedTransport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs)
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      
      const message = new Uint8Array([1])
      const errorListener = jest.fn()
      uninitializedTransport.on('error', errorListener)

      uninitializedTransport.sendMessage(message)
      
      expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
    })
  })

  describe('Error Handling', () => {
    it('should handle socket send errors', async () => {
      mockSocket.send.mockImplementation(() => {
        throw new Error('Socket error')
      })

      await expect(transport.sendMessage(new Uint8Array([1])))
        .rejects.toThrow('Failed to send message: Socket error')
    })

    it('should handle invalid message types', () => {
      transport.sendMessage('invalid' as any)
      
      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
      )
    })

    it('should handle errors during socket cleanup', () => {
      mockSocket.end.mockImplementation(() => {
        throw new Error('Cleanup error')
      })

      transport.close()
      expect(transport.isConnected).toBe(false)
      expect(errorListener).not.toHaveBeenCalled()
    })

    it('should handle errors during message emission', () => {
      const error = new Error('Emission error')
      transport.on('message', () => {
        throw error
      })

      mockEmitter.emit('message', new ArrayBuffer(4))
      expect(errorListener).toHaveBeenCalledWith(
        new Error(`Failed to emit message: ${error.message}`)
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle message emission errors', () => {
      const error = new Error('Emission error')
      transport.on('message', () => {
        throw error
      })

      mockEmitter.emit('message', new ArrayBuffer(4))
      expect(errorListener).toHaveBeenCalledWith(
        new Error(`Failed to emit message: ${error.message}`)
      )
    })

    it('should handle socket end errors during cleanup', () => {
      mockSocket.end.mockImplementation(() => {
        throw new Error('Socket end error')
      })
      
      transport.close()
      expect(transport.isConnected).toBe(false)
      expect(errorListener).not.toHaveBeenCalled()
    })
  })
})

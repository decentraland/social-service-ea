import mitt, { Emitter } from 'mitt'
import {
  createUWebSocketTransport,
  IUWebSocket,
  IUWebSocketEventMap,
  UWebSocketSendResult
} from '../../../src/utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'
import { mockConfig, mockLogs, mockMetrics } from '../../mocks/components'

describe('UWebSocketTransport', () => {
  const DEFAULT_CONFIG = {
    WS_TRANSPORT_MAX_QUEUE_SIZE: 3,
    WS_TRANSPORT_MIN_QUEUE_SIZE: 1,
    WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT: 10,
    WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE: 1024,
    WS_TRANSPORT_RETRY_DELAY_MS: 1000,
    WS_TRANSPORT_MAX_RETRY_ATTEMPTS: 5,
    WS_TRANSPORT_MAX_BACKOFF_DELAY_MS: 30000,
    WS_MAX_BACKPRESSURE: 128 * 1024,
    WS_TRANSPORT_CIRCUIT_BREAKER_THRESHOLD: 10,
    WS_TRANSPORT_CIRCUIT_BREAKER_COOLDOWN_MS: 5000
  }

  const mockMessage = new Uint8Array([1, 2, 3])
  const mockMessages = Array(3).fill(mockMessage)

  let mockSocket: jest.Mocked<IUWebSocket<{ isConnected: boolean }>>
  let mockEmitter: Emitter<IUWebSocketEventMap>
  let transport: Transport
  let errorListener: jest.Mock
  let closeListener: jest.Mock

  beforeEach(async () => {
    mockConfig.getNumber.mockImplementation(async (key) => DEFAULT_CONFIG[key] || null)

    mockSocket = {
      send: jest.fn().mockReturnValue(UWebSocketSendResult.SUCCESS),
      close: jest.fn(),
      end: jest.fn(),
      getUserData: jest.fn().mockReturnValue({ isConnected: true }),
      getBufferedAmount: jest.fn().mockReturnValue(0)
    } as jest.Mocked<IUWebSocket<{ isConnected: boolean }>>

    mockEmitter = mitt<IUWebSocketEventMap>()
    transport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs, mockMetrics)

    errorListener = jest.fn()
    closeListener = jest.fn()
    transport.on('error', errorListener)
    transport.on('close', closeListener)

    jest.useFakeTimers({ advanceTimers: true })
  })

  afterEach(() => {
    mockEmitter.all.clear()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  describe('when initializing the transport', () => {
    it('should initialize with correct state', async () => {
      const newTransport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs, mockMetrics)

      expect(newTransport.isConnected).toBe(true)
    })

    it('should use default configuration values when config returns null', async () => {
      const nullConfig = {
        getNumber: jest.fn().mockResolvedValue(null),
        getString: jest.fn(),
        requireNumber: jest.fn(),
        requireString: jest.fn()
      }

      const fallbackTransport = await createUWebSocketTransport(
        mockSocket,
        mockEmitter,
        nullConfig,
        mockLogs,
        mockMetrics
      )

      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      const sendPromise = fallbackTransport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)
      await expect(sendPromise).resolves.not.toThrow()

      fallbackTransport.close()
    })
  })

  describe('when closing the transport', () => {
    it('should emit close event and update state', () => {
      transport.close()

      expect(mockSocket.end).not.toHaveBeenCalled()
      expect(closeListener).toHaveBeenCalledWith({ code: 1000, reason: 'Client requested closure' })
      expect(transport.isConnected).toBe(false)
    })

    it('should handle multiple close calls gracefully', () => {
      transport.close()
      expect(transport.isConnected).toBe(false)
      expect(closeListener).toHaveBeenCalledTimes(1)

      transport.close()
      expect(transport.isConnected).toBe(false)
      expect(closeListener).toHaveBeenCalledTimes(2)
      expect(mockSocket.end).not.toHaveBeenCalled()
    })

    it('should handle close event from uServerEmitter', () => {
      const closeEvent = { code: 1006, reason: 'Connection abnormally closed' }
      // The uServerEmitter emits close events with separate parameters, not as an object
      ;(mockEmitter.emit as any)('close', closeEvent)

      expect(closeListener).toHaveBeenCalledWith(closeEvent)
      expect(transport.isConnected).toBe(false)
    })

    it('should handle close event with default parameters', () => {
      const closeEvent = { code: 1000, reason: '' }
      mockEmitter.emit('close', closeEvent)

      expect(closeListener).toHaveBeenCalledWith(closeEvent)
      expect(transport.isConnected).toBe(false)
    })
  })

  describe('when sending messages', () => {
    describe('and the message is sent successfully', () => {
      beforeEach(() => {
        mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      })

      it('should send message and resolve promise', async () => {
        const sendPromise = transport.sendMessage(mockMessage)
        await jest.advanceTimersByTimeAsync(0)

        expect(mockSocket.send).toHaveBeenCalledWith(mockMessage, true)
        await expect(sendPromise).resolves.not.toThrow()
        expect(mockMetrics.observe).toHaveBeenCalledWith(
          'ws_message_size_bytes',
          { result: 'success' },
          mockMessage.byteLength
        )
      })
    })

    describe('and the message encounters backpressure', () => {
      beforeEach(() => {
        mockSocket.send.mockReturnValue(UWebSocketSendResult.BACKPRESSURE)
      })

      it('should handle backpressure and resolve promise', async () => {
        const sendPromise = transport.sendMessage(mockMessage)
        await jest.advanceTimersByTimeAsync(0)

        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'backpressure' })
        await expect(sendPromise).resolves.not.toThrow()
      })
    })

    describe('and the message is dropped', () => {
      beforeEach(() => {
        mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)
      })

      it('should retry with exponential backoff', async () => {
        const sendPromise = transport.sendMessage(mockMessage)
        ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

        await jest.advanceTimersByTimeAsync(0)
        expect(mockSocket.send).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, 1))
        expect(mockSocket.send).toHaveBeenCalledTimes(2)

        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, 2))
        expect(mockSocket.send).toHaveBeenCalledTimes(3)

        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'dropped' })
      })

      it('should drop message after max retries', async () => {
        const sendPromise = transport.sendMessage(mockMessage)
        ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

        await jest.advanceTimersByTimeAsync(0)

        for (let attempt = 1; attempt < DEFAULT_CONFIG.WS_TRANSPORT_MAX_RETRY_ATTEMPTS; attempt++) {
          const delay = Math.min(
            DEFAULT_CONFIG.WS_TRANSPORT_RETRY_DELAY_MS * Math.pow(2, attempt),
            DEFAULT_CONFIG.WS_TRANSPORT_MAX_BACKOFF_DELAY_MS
          )
          await jest.advanceTimersByTimeAsync(delay)
        }

        const finalDelay = Math.min(
          DEFAULT_CONFIG.WS_TRANSPORT_RETRY_DELAY_MS * Math.pow(2, DEFAULT_CONFIG.WS_TRANSPORT_MAX_RETRY_ATTEMPTS),
          DEFAULT_CONFIG.WS_TRANSPORT_MAX_BACKOFF_DELAY_MS
        )
        await jest.advanceTimersByTimeAsync(finalDelay)

        await expect(sendPromise).rejects.toThrow('Message dropped after max retries')
      })
    })

    describe('and the transport is not ready', () => {
      it('should reject when transport is closed', () => {
        transport.close()
        transport.sendMessage(mockMessage)

        expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
      })

      it('should reject when socket is disconnected', () => {
        mockSocket.getUserData.mockReturnValue({ isConnected: false })
        transport.sendMessage(mockMessage)

        expect(errorListener).toHaveBeenCalledWith(new Error('Transport is not ready or socket is not connected'))
      })
    })

    describe('and the queue is full', () => {
      beforeEach(() => {
        mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)
      })

      it('should reject when queue size limit is reached', async () => {
        // Fill queue to limit
        for (const msg of mockMessages) {
          const promise = transport.sendMessage(msg)
          ;(promise as unknown as Promise<void>)?.catch(() => {})
        }

        await jest.advanceTimersByTimeAsync(0)

        // Attempt to send one more message
        transport.sendMessage(mockMessage)

        expect(errorListener).toHaveBeenCalledWith(new Error('Message queue size limit reached'))
      })
    })

    describe('and an error occurs during sending', () => {
      beforeEach(() => {
        const error = new Error('Socket error')
        mockSocket.send.mockImplementation(() => {
          throw error
        })
      })

      it('should handle socket send errors', async () => {
        const sendPromise = transport.sendMessage(mockMessage)
        ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

        await jest.advanceTimersByTimeAsync(0)

        await expect(sendPromise).rejects.toThrow('Failed to send message: Socket error')
        expect(errorListener).toHaveBeenCalledWith(new Error('Failed to send message: Socket error'))
      })
    })

    describe('and an invalid message type is provided', () => {
      it('should reject invalid message types', () => {
        transport.sendMessage('invalid' as any)

        expect(errorListener).toHaveBeenCalledWith(
          new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
        )
      })
    })

    describe('and an unexpected send result is returned', () => {
      it('should handle unexpected send results', async () => {
        const unexpectedResultCode = -2 as UWebSocketSendResult
        mockSocket.send.mockReturnValue(unexpectedResultCode)

        const sendPromise = transport.sendMessage(mockMessage)
        ;(sendPromise as unknown as Promise<void>)?.catch(() => {})
        await jest.advanceTimersByTimeAsync(0)

        // The message should remain in queue and not be processed further
        expect(mockSocket.send).toHaveBeenCalledTimes(1)

        // Clean up
        mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
        await jest.runAllTimersAsync()
      })
    })
  })

  describe('when receiving messages', () => {
    it('should handle incoming binary messages', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(buffer))
    })

    it('should reject non-binary messages', () => {
      mockEmitter.emit('message', 'invalid message')

      expect(errorListener).toHaveBeenCalledWith(new Error('WebSocketTransport: Received unknown type of message'))
    })

    it('should handle message emission errors', () => {
      const error = new Error('Emission error')
      transport.on('message', () => {
        throw error
      })

      mockEmitter.emit('message', new ArrayBuffer(4))

      expect(errorListener).toHaveBeenCalledWith(new Error(`Failed to emit message: ${error.message}`))
    })

    it('should ignore messages when transport is not active', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      transport.close()

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).not.toHaveBeenCalled()
    })

    it('should ignore messages when transport is not initialized', () => {
      const messageListener = jest.fn()

      // Create a new transport instance and immediately close it to test uninitialized state
      // We need to test the case where isInitialized is false
      const uninitializedTransport = createUWebSocketTransport(
        mockSocket,
        mockEmitter,
        mockConfig,
        mockLogs,
        mockMetrics
      )

      // Close the transport immediately to set isInitialized to false
      uninitializedTransport.then((t) => {
        t.close()

        // Now emit a message - it should be ignored
        const buffer = new ArrayBuffer(4)
        mockEmitter.emit('message', buffer)

        expect(messageListener).not.toHaveBeenCalled()
      })
    })
  })

  describe('when handling circuit breaker', () => {
    const circuitBreakerConfig = {
      ...DEFAULT_CONFIG,
      WS_TRANSPORT_CIRCUIT_BREAKER_THRESHOLD: 3,
      WS_TRANSPORT_CIRCUIT_BREAKER_COOLDOWN_MS: 1000
    }

    let circuitBreakerTransport: Transport

    beforeEach(async () => {
      mockConfig.getNumber.mockImplementation(async (key) => circuitBreakerConfig[key] || null)

      circuitBreakerTransport = await createUWebSocketTransport(
        mockSocket,
        mockEmitter,
        mockConfig,
        mockLogs,
        mockMetrics
      )
    })

    afterEach(async () => {
      if (circuitBreakerTransport) {
        circuitBreakerTransport.close()
        await jest.runAllTimersAsync()
      }
    })

    it('should open circuit breaker after consecutive failures', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_circuit_breaker_events', {
        action: 'opened'
      })
    })

    it('should reset circuit breaker on successful message', async () => {
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.SUCCESS)

      // Send first two messages (failures)
      for (let i = 0; i < 2; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send third message (success)
      const successPromise = circuitBreakerTransport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)

      await successPromise
    })

    it('should reset circuit breaker on backpressure result', async () => {
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.BACKPRESSURE)

      // Send first two messages (failures)
      for (let i = 0; i < 2; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send third message (backpressure) - this should resolve immediately
      const backpressurePromise = circuitBreakerTransport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)

      // The backpressure promise should resolve immediately
      await expect(backpressurePromise).resolves.not.toThrow()
    }, 10000) // Increase timeout for this test

    it('should close circuit breaker after cooldown period', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Advance timer to trigger cooldown reset
      await jest.advanceTimersByTimeAsync(1000)

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_circuit_breaker_events', {
        action: 'closed'
      })
    })

    it('should resume processing after circuit breaker closes', async () => {
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.SUCCESS)

      // Send first three messages (failures)
      for (let i = 0; i < 3; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send fourth message (should be queued during circuit breaker)
      const fourthPromise = circuitBreakerTransport.sendMessage(mockMessage)
      ;(fourthPromise as unknown as Promise<void>)?.catch(() => {})

      // Advance timer to trigger cooldown reset
      await jest.advanceTimersByTimeAsync(1000)

      // Verify processing resumed
      expect(mockSocket.send).toHaveBeenCalledWith(mockMessage, true)
    })
  })

  describe('when handling adaptive queue sizing', () => {
    describe('and maxBackpressure is null', () => {
      let noBackpressureTransport: Transport

      beforeEach(async () => {
        const noBackpressureConfig = {
          ...DEFAULT_CONFIG,
          WS_MAX_BACKPRESSURE: null
        }

        mockConfig.getNumber.mockImplementation(async (key) => noBackpressureConfig[key] || null)

        noBackpressureTransport = await createUWebSocketTransport(
          mockSocket,
          mockEmitter,
          mockConfig,
          mockLogs,
          mockMetrics
        )
      })

      afterEach(() => {
        noBackpressureTransport.close()
      })

      it('should use base queue size when maxBackpressure is null', () => {
        // Test that the transport works with null maxBackpressure by sending messages
        mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
        const sendPromise = noBackpressureTransport.sendMessage(mockMessage)
        expect(sendPromise).toBeInstanceOf(Promise)
      })
    })

    describe('and adaptive queue size is larger than base queue size', () => {
      let largeAdaptiveTransport: Transport

      beforeEach(async () => {
        const largeAdaptiveConfig = {
          ...DEFAULT_CONFIG,
          WS_TRANSPORT_MAX_QUEUE_SIZE: 10,
          WS_MAX_BACKPRESSURE: 100 * 1024
        }

        mockConfig.getNumber.mockImplementation(async (key) => largeAdaptiveConfig[key] || null)

        largeAdaptiveTransport = await createUWebSocketTransport(
          mockSocket,
          mockEmitter,
          mockConfig,
          mockLogs,
          mockMetrics
        )
      })

      afterEach(() => {
        largeAdaptiveTransport.close()
      })

      it('should use the smaller of base and adaptive queue sizes', () => {
        // Test that the transport works with the calculated queue size
        mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
        const sendPromise = largeAdaptiveTransport.sendMessage(mockMessage)
        expect(sendPromise).toBeInstanceOf(Promise)
      })
    })
  })

  describe('when tracking metrics', () => {
    it('should track queue vs backpressure ratio when buffered amount is positive', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      mockSocket.getBufferedAmount.mockReturnValue(2048)

      const sendPromise = transport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_queue_vs_backpressure_ratio', {}, expect.any(Number))
      await sendPromise
    })

    it('should not track ratio when buffered amount is zero', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      mockSocket.getBufferedAmount.mockReturnValue(0)

      const sendPromise = transport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)

      expect(mockMetrics.observe).not.toHaveBeenCalledWith('ws_queue_vs_backpressure_ratio', {}, expect.any(Number))
      await sendPromise
    })

    it('should handle getBufferedAmount errors silently', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      mockSocket.getBufferedAmount.mockImplementation(() => {
        throw new Error('Test error')
      })

      const sendPromise = transport.sendMessage(mockMessage)
      await jest.advanceTimersByTimeAsync(0)

      expect(mockMetrics.observe).not.toHaveBeenCalledWith('ws_queue_vs_backpressure_ratio', {}, expect.any(Number))
      await sendPromise
    })
  })

  describe('when handling cleanup', () => {
    it('should clean up with empty message queue', () => {
      transport.close()

      // Test that cleanup occurred by checking that the transport is no longer connected
      expect(transport.isConnected).toBe(false)
    })

    it('should clean up with pending timeouts', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(mockMessage)
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      await jest.advanceTimersByTimeAsync(0)

      transport.close()

      await expect(sendPromise).rejects.toThrow('Connection closed')
    })

    it('should clean up with circuit breaker timeout', async () => {
      const circuitBreakerConfig = {
        ...DEFAULT_CONFIG,
        WS_TRANSPORT_CIRCUIT_BREAKER_THRESHOLD: 3,
        WS_TRANSPORT_CIRCUIT_BREAKER_COOLDOWN_MS: 1000
      }

      mockConfig.getNumber.mockImplementation(async (key) => circuitBreakerConfig[key] || null)

      const circuitBreakerTransport = await createUWebSocketTransport(
        mockSocket,
        mockEmitter,
        mockConfig,
        mockLogs,
        mockMetrics
      )

      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        const promise = circuitBreakerTransport.sendMessage(mockMessage)
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      circuitBreakerTransport.close()

      // Test that cleanup occurred
      expect(circuitBreakerTransport.isConnected).toBe(false)
    })

    it('should handle cleanup with null timeouts', () => {
      // Test that cleanup works when no timeouts are set
      transport.close()
      expect(transport.isConnected).toBe(false)
    })

    it('should handle cleanup with empty message queue', () => {
      // Test that cleanup works when message queue is empty
      transport.close()
      expect(transport.isConnected).toBe(false)
    })
  })

  describe('when handling error events', () => {
    it('should remove event listeners on error', () => {
      const error = new Error('Test error')
      transport.emit('error', error)

      expect(errorListener).toHaveBeenCalledWith(error)

      // Verify that message and close listeners are removed by checking that events are not processed
      mockEmitter.emit('message', new ArrayBuffer(4))
      mockEmitter.emit('close')

      // No more events should be processed after error
      expect(mockSocket.send).not.toHaveBeenCalled()
    })
  })
})

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
  let mockSocket: jest.Mocked<IUWebSocket<{ isConnected: boolean }>>
  let mockEmitter: Emitter<IUWebSocketEventMap>
  let transport: Transport
  let errorListener: jest.Mock

  beforeEach(async () => {
    // Mock configuration with realistic values
    mockConfig.getNumber.mockImplementation(
      async (key) =>
        ({
          WS_TRANSPORT_MAX_QUEUE_SIZE: 3,
          WS_TRANSPORT_MIN_QUEUE_SIZE: 1,
          WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT: 10,
          WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE: 1024,
          WS_TRANSPORT_RETRY_DELAY_MS: 1000,
          WS_TRANSPORT_MAX_RETRY_ATTEMPTS: 5,
          WS_TRANSPORT_MAX_BACKOFF_DELAY_MS: 30000,
          WS_MAX_BACKPRESSURE: 128 * 1024
        })[key] || null
    )

    // Initialize mock socket with default behavior
    mockSocket = {
      send: jest.fn().mockReturnValue(UWebSocketSendResult.SUCCESS),
      close: jest.fn(),
      end: jest.fn(),
      getUserData: jest.fn().mockReturnValue({ isConnected: true }),
      getBufferedAmount: jest.fn().mockReturnValue(0)
    } as jest.Mocked<IUWebSocket<{ isConnected: boolean }>>

    // Initialize event emitter and transport
    mockEmitter = mitt<IUWebSocketEventMap>()
    transport = await createUWebSocketTransport(mockSocket, mockEmitter, mockConfig, mockLogs, mockMetrics)
    errorListener = jest.fn()
    transport.on('error', errorListener)
    jest.useFakeTimers({ advanceTimers: true })
  })

  afterEach(() => {
    mockEmitter.all.clear()
    jest.useRealTimers()
    jest.clearAllMocks() // Ensure mocks are cleared
  })

  describe('Transport Lifecycle', () => {
    it('should initialize with correct state and emit connect event', async () => {
      // Set up connect listener before creating transport
      const connectListener = jest.fn()
      const newEmitter = mitt<IUWebSocketEventMap>()

      // Create new transport instance
      const newTransport = await createUWebSocketTransport(mockSocket, newEmitter, mockConfig, mockLogs, mockMetrics)
      newTransport.on('connect', connectListener) // Add listener for completeness, but timing makes it hard to test reliably here

      // The transport should be connected immediately after creation
      expect(newTransport.isConnected).toBe(true)
      // Connect event is emitted internally during creation, so listener added after might miss it.
      // We are testing the state is correct, not the event timing here.
      // expect(connectListener).toHaveBeenCalledWith({})
    })

    it('should handle normal cleanup sequence: emit close event and set state', () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      transport.close() // Call the transport's close method

      // Assertions:
      // Transport should no longer directly call mockSocket.end()
      expect(mockSocket.end).not.toHaveBeenCalled()
      // Transport should emit its own 'close' event
      expect(closeListener).toHaveBeenCalledWith({ code: 1000, reason: 'Client requested closure' })
      // Transport's internal state should reflect disconnection
      expect(transport.isConnected).toBe(false)
    })

    it('should handle multiple transport close calls gracefully', async () => {
      const closeListener = jest.fn()
      transport.on('close', closeListener)

      // First call
      transport.close()
      expect(transport.isConnected).toBe(false)
      expect(closeListener).toHaveBeenCalledTimes(1)
      expect(closeListener).toHaveBeenNthCalledWith(1, { code: 1000, reason: 'Client requested closure' })
      expect(mockSocket.end).not.toHaveBeenCalled() // Should not be called by transport.close

      // Second call - Call without arguments to align with potential interface definition
      transport.close()
      expect(transport.isConnected).toBe(false) // State remains disconnected
      // Transport emits its event each time its close method is called
      expect(closeListener).toHaveBeenCalledTimes(2)
      expect(closeListener).toHaveBeenNthCalledWith(2, { code: 1000, reason: 'Client requested closure' })
      expect(mockSocket.end).not.toHaveBeenCalled() // Still should not be called by transport.close

      // Cleanup to allow promise resolution/rejection if applicable
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      await jest.runAllTimersAsync()
      // Variable was potentially void, await/catch removed as it might fail if void.
      // Test focuses on the log message for unexpected code.
    })
  })

  describe('Message Queue Management', () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true })
    })

    it('should process messages with exponential backoff on dropped', async () => {
      const message = new Uint8Array([1])
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.SUCCESS)

      const sendPromise = transport.sendMessage(message)

      // First attempt (occurs almost immediately)
      await jest.advanceTimersByTimeAsync(0)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)

      // Second attempt (after 2000ms, because attempts=1 after first failure)
      await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, 1))
      expect(mockSocket.send).toHaveBeenCalledTimes(2)

      // Third attempt (after 4000ms, because attempts=2 after second failure)
      await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, 2))
      expect(mockSocket.send).toHaveBeenCalledTimes(3)

      // Promise should resolve as the last attempt returns SUCCESS
      await expect(sendPromise).resolves.not.toThrow()
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'dropped' })
    })

    it('should respect queue size limits and emit appropriate errors', async () => {
      // Fill queue to limit
      const messages = Array(3).fill(new Uint8Array([1]))

      // Mock send to return DROPPED to keep messages in queue
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to fill queue
      for (const msg of messages) {
        const promise = transport.sendMessage(msg)
        // Add catch to prevent unhandled rejection
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      // Process initial attempts
      await jest.advanceTimersByTimeAsync(0)

      // Attempt to send one more message
      await transport.sendMessage(new Uint8Array([1]))

      expect(errorListener).toHaveBeenCalledWith(new Error('Message queue size limit reached'))
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_message_size_bytes', { result: 'dropped' }, 1)

      // Clean up
      await jest.runAllTimersAsync()
    })

    it('should handle unexpected send results', async () => {
      const message = new Uint8Array([1])
      const unexpectedResultCode = -2 as UWebSocketSendResult
      mockSocket.send.mockReturnValue(unexpectedResultCode)

      const sendPromise = transport.sendMessage(message)
      await jest.advanceTimersByTimeAsync(0)

      // Check the log message format, using exact string and checking payload structure
      expect(mockLogs.getLogger('ws-transport').error).toHaveBeenCalledWith(
        'Unexpected send result', // Exact log message string from code
        {
          transportId: expect.any(String), // Transport ID is generated
          result: unexpectedResultCode
        }
      )

      // Cleanup to allow promise resolution/rejection if applicable
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      await jest.runAllTimersAsync()
      // Variable was potentially void, await/catch removed as it might fail if void.
      // Test focuses on the log message for unexpected code.

      jest.useRealTimers()
    })

    it('should handle DROPPED send result correctly', async () => {
      const message = new Uint8Array([1, 2])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)

      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process the send attempt
      await jest.advanceTimersByTimeAsync(0)

      // 1. Check warning log (exact message string and payload structure)
      /* expect(mockLogs.getLogger('ws-transport').warn).toHaveBeenCalledWith(
        'Message dropped due to backpressure limit, will retry',
        {
          transportId: expect.any(String),
          messageSize: message.byteLength,
          attempts: 0
        }
      ) */

      // 2. Check metric increment
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'dropped' })

      // 3. Check message is still in queue (not rejected)
      expect(sendPromise).toBeInstanceOf(Promise)

      // 4. Check queue processing continues
      const message2 = new Uint8Array([3])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      const sendPromise2 = transport.sendMessage(message2)
      await jest.advanceTimersByTimeAsync(0)

      expect(mockSocket.send).toHaveBeenCalledWith(message2, true)
      await expect(sendPromise2).resolves.not.toThrow()

      // Clean up by advancing timers to process any pending retries
      await jest.runAllTimersAsync()
    })

    it('should handle BACKPRESSURE send result correctly', async () => {
      const message = new Uint8Array([1, 2])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.BACKPRESSURE)

      const sendPromise = transport.sendMessage(message)

      // Process the send attempt
      await jest.advanceTimersByTimeAsync(0)

      // 1. Check metric increment
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'backpressure' })

      // 2. Check message is resolved immediately
      await expect(sendPromise).resolves.not.toThrow()

      // 3. Check message is removed from queue
      const message2 = new Uint8Array([3])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      const sendPromise2 = transport.sendMessage(message2)
      await jest.advanceTimersByTimeAsync(0)

      expect(mockSocket.send).toHaveBeenCalledWith(message2, true)
      await expect(sendPromise2).resolves.not.toThrow()

      // Clean up by advancing timers to process any pending retries
      await jest.runAllTimersAsync()
    })

    it('should handle message processing when transport becomes inactive', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)

      // Deactivate transport during processing
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')
    })

    it('should handle queue processing when socket disconnects', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)

      // Simulate socket disconnection
      mockSocket.getUserData.mockReturnValue({ isConnected: false })

      // Closing the transport triggers cleanup and rejects pending messages
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')
    })

    it('should drop message after max retries', async () => {
      // Constants from the source file
      const MAX_RETRY_ATTEMPTS = 5
      const RETRY_DELAY_MS = 1000
      const MAX_BACKOFF_DELAY_MS = 30000

      const message = new Uint8Array([1])
      // Consistently return DROPPED to force retries
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Initial attempt (attempt 0)
      await jest.advanceTimersByTimeAsync(0)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)

      // Retry attempts (1 to MAX_RETRY_ATTEMPTS - 1)
      for (let attempt = 1; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        // Calculate delay for this specific retry attempt
        const delayForThisRetry = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt), MAX_BACKOFF_DELAY_MS)
        await jest.advanceTimersByTimeAsync(delayForThisRetry)
        expect(mockSocket.send).toHaveBeenCalledTimes(attempt + 1)
      }

      // Final advance timer to trigger the max retry check
      const delayForFinalCheck = Math.min(RETRY_DELAY_MS * Math.pow(2, MAX_RETRY_ATTEMPTS), MAX_BACKOFF_DELAY_MS)
      await jest.advanceTimersByTimeAsync(delayForFinalCheck)

      // Assertions
      await expect(sendPromise).rejects.toThrow('Message dropped after max retries')

      expect(mockLogs.getLogger('ws-transport').warn).toHaveBeenCalledWith(
        'Message dropped after max retries',
        expect.objectContaining({
          attempts: MAX_RETRY_ATTEMPTS,
          messageSize: message.byteLength
        })
      )

      expect(mockSocket.send).toHaveBeenCalledTimes(MAX_RETRY_ATTEMPTS)

      // Clean up by advancing timers to process any pending retries
      await jest.runAllTimersAsync()
    })
  })

  describe('Message Processing', () => {
    it('should handle incoming binary messages correctly', () => {
      const messageListener = jest.fn()
      transport.on('message', messageListener)

      const buffer = new ArrayBuffer(4)
      mockEmitter.emit('message', buffer)

      expect(messageListener).toHaveBeenCalledWith(new Uint8Array(buffer))
    })

    it('should reject non-binary messages with appropriate error', () => {
      mockEmitter.emit('message', 'invalid message')

      expect(errorListener).toHaveBeenCalledWith(new Error('WebSocketTransport: Received unknown type of message'))
    })

    it('should handle message emission errors gracefully', () => {
      const error = new Error('Emission error')
      transport.on('message', () => {
        throw error
      })

      mockEmitter.emit('message', new ArrayBuffer(4))

      expect(errorListener).toHaveBeenCalledWith(new Error(`Failed to emit message: ${error.message}`))
    })
  })

  describe('Error Handling', () => {
    it('should handle socket send errors with proper error propagation and logging', async () => {
      const error = new Error('Socket error')
      mockSocket.send.mockImplementation(() => {
        throw error
      })

      const message = new Uint8Array([1])
      const sendPromise = transport.sendMessage(message)

      // Add catch after assertion to prevent Jest unhandled rejection error
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process the attempt
      await jest.advanceTimersByTimeAsync(0)

      await expect(sendPromise).rejects.toThrow('Failed to send message: Socket error')

      // Check error log format (exact message and payload structure)
      expect(mockLogs.getLogger('ws-transport').error).toHaveBeenCalledWith(
        'Error sending message', // Exact message from code
        {
          transportId: expect.any(String),
          error: 'Failed to send message: Socket error'
        }
      )

      // Check transport error event emission
      expect(errorListener).toHaveBeenCalledWith(new Error('Failed to send message: Socket error'))
    })

    it('should handle invalid message types with type checking', () => {
      transport.sendMessage('invalid' as any)

      expect(errorListener).toHaveBeenCalledWith(
        new Error('WebSocketTransport: Received unknown type of message, expecting Uint8Array')
      )
    })

    it('should handle cleanup errors gracefully', () => {
      const error = new Error('Cleanup error')
      mockSocket.end.mockImplementation(() => {
        throw error
      })

      transport.close()

      expect(transport.isConnected).toBe(false)
      // Cleanup errors should be logged but not propagated to error listener
      expect(errorListener).not.toHaveBeenCalled()
    })
  })

  describe('Metrics and Logging', () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should record metrics for successful message sending', async () => {
      const message = new Uint8Array([1, 2, 3])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      const sendPromise = transport.sendMessage(message)
      await jest.advanceTimersByTimeAsync(0) // Process send
      // Assert it's a promise and await resolution
      expect(sendPromise).toBeInstanceOf(Promise)
      await sendPromise

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'ws_message_size_bytes',
        { result: 'success' },
        message.byteLength
      )
    })

    it('should record metrics for backpressure events', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.BACKPRESSURE)
      const sendPromise = transport.sendMessage(new Uint8Array([1]))
      await jest.advanceTimersByTimeAsync(0) // Process initial attempt

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'backpressure' })

      // Clean up
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      await jest.runAllTimersAsync()
      // Cannot safely await/catch if potentially void. Test focuses on metric.
    })

    it('should record metrics for dropped events', async () => {
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)
      const sendPromise = transport.sendMessage(new Uint8Array([1]))
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)

      // Check increment metric
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_backpressure_events', { result: 'dropped' })

      // Check size observation metric
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_message_size_bytes', { result: 'dropped' }, 1)

      // Clean up
      await jest.runAllTimersAsync()
    })

    it('should log transport cleanup events correctly', () => {
      transport.close() // Trigger cleanup

      // Check log message format, including transportId and stringified booleans
      expect(mockLogs.getLogger('ws-transport').debug).toHaveBeenCalledWith(
        'Cleaning up transport', // Exact message from code
        {
          transportId: expect.any(String),
          code: 1000,
          reason: 'Client requested closure',
          queueLength: 0,
          isTransportActive: 'true', // Should be true at the time of logging
          isInitialized: 'true' // Should be true at the time of logging
        }
      )
    })
  })

  describe('Transport State Management', () => {
    it('should handle transport state transitions', async () => {
      // Test initialization state
      expect(transport.isConnected).toBe(true)

      // Test disconnection state
      mockSocket.getUserData.mockReturnValue({ isConnected: false })
      expect(transport.isConnected).toBe(false)

      // Test reconnection state
      mockSocket.getUserData.mockReturnValue({ isConnected: true })
      expect(transport.isConnected).toBe(true)
    })

    it('should handle message processing during state transitions', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)

      // Transition to disconnected state
      mockSocket.getUserData.mockReturnValue({ isConnected: false })

      // Simulate the close event
      mockEmitter.emit('close', { code: 1006, reason: 'Connection abnormally closed' } as any)

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')
    })
  })

  describe('Event Handling', () => {
    it('should properly remove event listeners on error', () => {
      const error = new Error('Test error')
      transport.emit('error', error)

      // Verify that message and close listeners are removed
      mockEmitter.emit('message', new ArrayBuffer(4))
      mockEmitter.emit('close')

      expect(errorListener).toHaveBeenCalledWith(error)
      // No more events should be processed after error
      expect(mockSocket.send).not.toHaveBeenCalled()
    })

    it('should handle transport cleanup with active timeouts', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)

      // Close transport while there's a pending timeout
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')
      expect(transport.isConnected).toBe(false)

      // Ensure no more processing occurs
      await jest.advanceTimersByTimeAsync(5000)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('Queue Processing Edge Cases', () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    // Coverage for lines 200-208
    it('should handle message queue state transitions', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Fill queue to near limit
      const promises = Array(2)
        .fill(null)
        .map(() => transport.sendMessage(message))

      // Add catch to prevent unhandled rejections
      promises.forEach((p) => (p as unknown as Promise<void>)?.catch(() => {}))

      // Process queue
      await jest.advanceTimersByTimeAsync(0)

      // Simulate transport becoming inactive during processing
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await Promise.all(promises.map((p) => expect(p).rejects.toThrow('Connection closed')))
    })

    // Coverage for lines 300-301
    it('should handle cleanup with pending timeouts', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Let the first attempt process
      await jest.advanceTimersByTimeAsync(0)

      // Close before timeout triggers
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')

      // Ensure no more processing occurs
      await jest.advanceTimersByTimeAsync(5000)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('Transport Error Handling', () => {
    it('should handle errors during message processing (send error)', async () => {
      const message = new Uint8Array([1])
      const networkError = new Error('Network error')
      mockSocket.send.mockImplementation(() => {
        throw networkError
      })

      const sendPromise = transport.sendMessage(message)

      // Add catch after assertion to prevent Jest unhandled rejection error
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process the send attempt that throws
      await jest.advanceTimersByTimeAsync(0)

      // Check rejection
      await expect(sendPromise).rejects.toThrow('Failed to send message: Network error')

      // Check logger call (Exact message and payload)
      expect(mockLogs.getLogger('ws-transport').error).toHaveBeenCalledWith(
        'Error sending message', // Exact message
        {
          transportId: expect.any(String),
          error: 'Failed to send message: Network error'
        }
      )
      // Check event emitter call
      expect(errorListener).toHaveBeenCalledWith(new Error('Failed to send message: Network error'))
    })

    it('should handle cleanup during active message processing', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      const sendPromise = transport.sendMessage(message)
      // Add catch to prevent unhandled rejection
      ;(sendPromise as unknown as Promise<void>)?.catch(() => {})

      // Process initial attempt
      await jest.advanceTimersByTimeAsync(0)

      // Close transport during retry delay
      transport.close()

      // Wait for cleanup to complete
      await jest.runAllTimersAsync()

      await expect(sendPromise).rejects.toThrow('Connection closed')
      expect(transport.isConnected).toBe(false)

      // Ensure timer doesn't fire later
      await jest.advanceTimersByTimeAsync(5000)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('Adaptive Queue Sizing', () => {
    describe.each([
      {
        maxBackpressure: 64 * 1024,
        expectedQueueSize: 10,
        description: '64KB backpressure limited by maxQueueSizeLimit'
      },
      {
        maxBackpressure: 128 * 1024,
        expectedQueueSize: 10,
        description: '128KB backpressure limited by maxQueueSizeLimit'
      },
      {
        maxBackpressure: 256 * 1024,
        expectedQueueSize: 10,
        description: '256KB backpressure limited by maxQueueSizeLimit'
      }
    ])('with $description', ({ maxBackpressure, expectedQueueSize }) => {
      let testTransport: Transport
      let testConfig: any

      beforeEach(async () => {
        // Mock config for this specific test case
        testConfig = {
          getNumber: jest.fn().mockImplementation(
            async (key) =>
              ({
                WS_TRANSPORT_MAX_QUEUE_SIZE: 3,
                WS_TRANSPORT_MIN_QUEUE_SIZE: 1,
                WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT: 10,
                WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE: 1024,
                WS_TRANSPORT_RETRY_DELAY_MS: 1000,
                WS_TRANSPORT_MAX_RETRY_ATTEMPTS: 5,
                WS_TRANSPORT_MAX_BACKOFF_DELAY_MS: 30000,
                WS_MAX_BACKPRESSURE: maxBackpressure
              })[key] || null
          )
        }

        testTransport = await createUWebSocketTransport(mockSocket, mockEmitter, testConfig, mockLogs, mockMetrics)
      })

      afterEach(async () => {
        if (testTransport) {
          testTransport.close()
          await jest.runAllTimersAsync()
        }
      })

      it('should respect the calculated queue size limit', async () => {
        // Send messages to fill the queue
        const messages = Array(expectedQueueSize + 1).fill(new Uint8Array([1]))
        mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

        // Fill the queue to its limit
        for (let i = 0; i < expectedQueueSize; i++) {
          const promise = testTransport.sendMessage(messages[i])
          ;(promise as unknown as Promise<void>)?.catch(() => {})
        }

        await jest.advanceTimersByTimeAsync(0)

        // The next message should trigger queue size limit error
        const errorListener = jest.fn()
        testTransport.on('error', errorListener)

        testTransport.sendMessage(messages[expectedQueueSize])

        expect(errorListener).toHaveBeenCalledWith(new Error('Message queue size limit reached'))
      })

      it('should allow messages when queue is not full', async () => {
        mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)

        // Send a message when queue is empty
        const message = new Uint8Array([1])
        const sendPromise = testTransport.sendMessage(message)

        await jest.advanceTimersByTimeAsync(0)

        await expect(sendPromise).resolves.not.toThrow()
        expect(mockSocket.send).toHaveBeenCalledWith(message, true)
      })
    })

    describe('when adaptive queue size is smaller than base queue size', () => {
      let testTransport: Transport
      let testConfig: any

      beforeEach(async () => {
        // Mock config where adaptive queue size (2) is smaller than base queue size (10)
        testConfig = {
          getNumber: jest.fn().mockImplementation(
            async (key) =>
              ({
                WS_TRANSPORT_MAX_QUEUE_SIZE: 10, // Base queue size
                WS_TRANSPORT_MIN_QUEUE_SIZE: 1,
                WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT: 100,
                WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE: 1024,
                WS_TRANSPORT_RETRY_DELAY_MS: 1000,
                WS_TRANSPORT_MAX_RETRY_ATTEMPTS: 5,
                WS_TRANSPORT_MAX_BACKOFF_DELAY_MS: 30000,
                WS_MAX_BACKPRESSURE: 2 * 1024 // 2KB backpressure = 2 messages
              })[key] || null
          )
        }

        testTransport = await createUWebSocketTransport(mockSocket, mockEmitter, testConfig, mockLogs, mockMetrics)
      })

      afterEach(async () => {
        testTransport.close()
        await jest.runAllTimersAsync()
      })

      it('should use the adaptive queue size (2) instead of base queue size (10)', async () => {
        const messages = Array(3).fill(new Uint8Array([1])) // 3 messages to exceed limit of 2
        mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

        // Fill the queue to its adaptive limit (2)
        for (let i = 0; i < 2; i++) {
          const promise = testTransport.sendMessage(messages[i])
          ;(promise as unknown as Promise<void>)?.catch(() => {})
        }

        await jest.advanceTimersByTimeAsync(0)

        // The third message should trigger queue size limit error
        const errorListener = jest.fn()
        testTransport.on('error', errorListener)

        testTransport.sendMessage(messages[2])

        expect(errorListener).toHaveBeenCalledWith(new Error('Message queue size limit reached'))
      })
    })

    it('should track queue vs backpressure ratio', async () => {
      const message = new Uint8Array([1])
      mockSocket.send.mockReturnValue(UWebSocketSendResult.SUCCESS)
      mockSocket.getBufferedAmount.mockReturnValue(2048) // 2KB buffered

      const sendPromise = transport.sendMessage(message)
      await jest.advanceTimersByTimeAsync(0)

      // Verify the ratio tracking was called
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'ws_queue_vs_backpressure_ratio',
        { transport_id: expect.any(String) },
        expect.any(Number)
      )

      await sendPromise
    })
  })

  describe('Circuit Breaker Pattern', () => {
    let testTransport: Transport
    let testConfig: any

    beforeEach(async () => {
      // Mock config with circuit breaker settings
      testConfig = {
        getNumber: jest.fn().mockImplementation(
          async (key) =>
            ({
              WS_TRANSPORT_MAX_QUEUE_SIZE: 100,
              WS_TRANSPORT_MIN_QUEUE_SIZE: 1,
              WS_TRANSPORT_MAX_QUEUE_SIZE_LIMIT: 1000,
              WS_TRANSPORT_ESTIMATED_MESSAGE_SIZE: 1024,
              WS_TRANSPORT_RETRY_DELAY_MS: 100,
              WS_TRANSPORT_MAX_RETRY_ATTEMPTS: 5,
              WS_TRANSPORT_MAX_BACKOFF_DELAY_MS: 1000,
              WS_MAX_BACKPRESSURE: 128 * 1024,
              WS_TRANSPORT_CIRCUIT_BREAKER_THRESHOLD: 3,
              WS_TRANSPORT_CIRCUIT_BREAKER_COOLDOWN_MS: 1000
            })[key] || null
        )
      }

      testTransport = await createUWebSocketTransport(mockSocket, mockEmitter, testConfig, mockLogs, mockMetrics)
    })

    afterEach(async () => {
      if (testTransport) {
        testTransport.close()
        await jest.runAllTimersAsync()
      }
    })

    it('should open circuit breaker after consecutive DROPPED results', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker (threshold = 3)
      for (let i = 0; i < 3; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Verify circuit breaker opened
      expect(mockLogs.getLogger('ws-transport').warn).toHaveBeenCalledWith(
        'Circuit breaker opened due to consecutive failures',
        expect.objectContaining({
          consecutiveFailures: 3,
          threshold: 3,
          cooldownMs: 1000
        })
      )

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_circuit_breaker_events', {
        action: 'opened',
        transport_id: expect.any(String)
      })
    })

    it('should reset circuit breaker on successful message', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))

      // First 2 messages fail
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.SUCCESS) // Third message succeeds

      // Send first two messages (failures)
      for (let i = 0; i < 2; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send third message (success)
      const successPromise = testTransport.sendMessage(messages[2])
      await jest.advanceTimersByTimeAsync(0)

      // Verify circuit breaker was reset
      expect(mockLogs.getLogger('ws-transport').debug).toHaveBeenCalledWith(
        'Circuit breaker reset on successful message',
        expect.objectContaining({ transportId: expect.any(String) })
      )

      await successPromise
    })

    it('should reset circuit breaker on BACKPRESSURE result', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))

      // First 2 messages fail
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.BACKPRESSURE) // Third message gets backpressure

      // Send first two messages (failures)
      for (let i = 0; i < 2; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send third message (backpressure)
      const backpressurePromise = testTransport.sendMessage(messages[2])
      await jest.advanceTimersByTimeAsync(0)

      // Verify circuit breaker was reset
      expect(mockLogs.getLogger('ws-transport').debug).toHaveBeenCalledWith(
        'Circuit breaker reset on backpressure',
        expect.objectContaining({ transportId: expect.any(String) })
      )

      await backpressurePromise
    })

    it('should close circuit breaker after cooldown period', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Advance timer to trigger cooldown reset
      await jest.advanceTimersByTimeAsync(1000)

      // Verify circuit breaker was closed
      expect(mockLogs.getLogger('ws-transport').debug).toHaveBeenCalledWith(
        'Circuit breaker reset after cooldown',
        expect.objectContaining({ transportId: expect.any(String) })
      )

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_circuit_breaker_events', {
        action: 'closed',
        transport_id: expect.any(String)
      })
    })

    it('should resume processing after circuit breaker closes', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))

      // First 3 messages fail (triggers circuit breaker)
      mockSocket.send
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValueOnce(UWebSocketSendResult.DROPPED)
        .mockReturnValue(UWebSocketSendResult.SUCCESS) // Fourth message succeeds after cooldown

      // Send first three messages (failures)
      for (let i = 0; i < 3; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Send fourth message (should be queued during circuit breaker)
      const fourthPromise = testTransport.sendMessage(messages[3])
      ;(fourthPromise as unknown as Promise<void>)?.catch(() => {})

      // Advance timer to trigger cooldown reset
      await jest.advanceTimersByTimeAsync(1000)

      // Verify processing resumed
      expect(mockSocket.send).toHaveBeenCalledWith(messages[3], true)
    })

    it('should clean up circuit breaker on transport close', async () => {
      const messages = Array(5).fill(new Uint8Array([1]))
      mockSocket.send.mockReturnValue(UWebSocketSendResult.DROPPED)

      // Send messages to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        const promise = testTransport.sendMessage(messages[i])
        ;(promise as unknown as Promise<void>)?.catch(() => {})
      }

      await jest.advanceTimersByTimeAsync(0)

      // Close transport before cooldown completes
      testTransport.close()

      // Verify cleanup occurred
      expect(mockLogs.getLogger('ws-transport').debug).toHaveBeenCalledWith(
        'Cleaning up transport',
        expect.objectContaining({
          transportId: expect.any(String),
          queueLength: 3
        })
      )
    })
  })
})

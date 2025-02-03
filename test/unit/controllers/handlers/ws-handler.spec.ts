import mitt from 'mitt'
import { verify } from '@dcl/platform-crypto-middleware'
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_INTERVAL_MS,
  registerWsHandler
} from '../../../../src/controllers/handlers/ws-handler'
import { mockLogs, mockMetrics, mockFetcher, mockUWs } from '../../../mocks/components'
import { WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../../src/types'

jest.mock('@dcl/platform-crypto-middleware')

describe('ws-handler', () => {
  const mockRpcServer = {
    attachUser: jest.fn()
  }

  let wsHandlers: any
  let mockWs: any
  let mockData: WsUserData
  let mockRes: any
  let mockReq: any
  let mockContext: any

  beforeEach(async () => {
    jest.useFakeTimers()

    mockData = {
      isConnected: false,
      auth: false
    } as WsNotAuthenticatedUserData

    mockWs = {
      getUserData: jest.fn().mockReturnValue(mockData),
      send: jest.fn(),
      end: jest.fn(),
      close: jest.fn()
    }

    mockRes = {
      upgrade: jest.fn()
    }

    mockReq = {
      getMethod: jest.fn().mockReturnValue('GET'),
      getHeader: jest.fn().mockImplementation((header) => {
        const headers = {
          'sec-websocket-key': 'test-key',
          'sec-websocket-protocol': 'test-protocol',
          'sec-websocket-extensions': 'test-extensions'
        }
        return headers[header]
      })
    }

    mockContext = {}

    await registerWsHandler({
      logs: mockLogs,
      server: mockUWs,
      metrics: mockMetrics,
      fetcher: mockFetcher,
      rpcServer: mockRpcServer
    })

    wsHandlers = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('upgrade handler', () => {
    it('should upgrade connection with correct parameters', () => {
      wsHandlers.upgrade(mockRes, mockReq, mockContext)

      expect(mockRes.upgrade).toHaveBeenCalledWith(
        {
          isConnected: false,
          auth: false
        },
        'test-key',
        'test-protocol',
        'test-extensions',
        mockContext
      )
      // The metrics increment happens in the open handler, not upgrade
      expect(mockMetrics.increment).toHaveBeenCalledWith('http_requests_total', {
        code: 101,
        handler: '/ws',
        method: 'GET'
      })
    })
  })

  describe('open handler', () => {
    it('should initialize non-authenticated connection with timeout', () => {
      const nonAuthData = {
        isConnected: false,
        auth: false
      } as WsNotAuthenticatedUserData
      mockWs.getUserData.mockReturnValue(nonAuthData)

      wsHandlers.open(mockWs)

      expect(nonAuthData.isConnected).toBe(true)
      expect(nonAuthData.timeout).toBeDefined()
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_connections')
    })

    it('should initialize authenticated connection without timeout', () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: false,
        auth: true,
        address: '0x123',
        eventEmitter: mitt(),
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0
      }
      mockWs.getUserData.mockReturnValue(authData)

      wsHandlers.open(mockWs)

      expect(authData.isConnected).toBe(true)
      expect((authData as any).timeout).toBeUndefined()
    })
  })

  describe('message handler', () => {
    describe('authenticated users', () => {
      let authData: WsAuthenticatedUserData

      beforeEach(() => {
        jest.useFakeTimers()
        const now = Date.now()
        jest.setSystemTime(now)

        authData = {
          isConnected: true,
          auth: true,
          address: '0x123',
          eventEmitter: mitt(),
          lastHeartbeat: now,
          reconnectAttempts: 0
        }
        mockWs.getUserData.mockReturnValue(authData)
      })

      it('should handle heartbeat messages', async () => {
        const initialHeartbeat = authData.lastHeartbeat
        jest.advanceTimersByTime(1000) // Advance time to ensure difference

        await wsHandlers.message(mockWs, Buffer.from('heartbeat'))

        expect(authData.lastHeartbeat).toBeGreaterThan(initialHeartbeat)
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_messages_received')
      })
    })

    describe('non-authenticated users', () => {
      let nonAuthData: WsNotAuthenticatedUserData

      beforeEach(() => {
        nonAuthData = {
          isConnected: true,
          auth: false,
          timeout: setTimeout(() => {}, 1000)
        }
        mockWs.getUserData.mockReturnValue(nonAuthData)
        ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })
      })

      it('should process valid authentication message', async () => {
        const authChain = { type: 'auth', data: 'test' }
        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))

        const userData = mockWs.getUserData()
        expect(userData.auth).toBe(true)
        expect(userData.address).toBe('0x123')
        expect(userData.eventEmitter).toBeDefined()
        expect(mockRpcServer.attachUser).toHaveBeenCalled()
      })

      it('should handle authentication failures', async () => {
        ;(verify as jest.Mock).mockRejectedValue(new Error('Invalid auth'))
        const authChain = { type: 'auth', data: 'test' }

        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))

        expect(mockWs.close).toHaveBeenCalled()
      })
    })
  })

  describe('heartbeat mechanism', () => {
    let authData: WsAuthenticatedUserData

    beforeEach(async () => {
      jest.useFakeTimers()
      const now = Date.now()
      jest.setSystemTime(now)
      // Mock verify to return successful auth
      ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })

      // Start with non-authenticated data
      const nonAuthData = {
        isConnected: true,
        auth: false
      } as WsNotAuthenticatedUserData

      mockWs.getUserData.mockReturnValue(nonAuthData)

      // Simulate authentication process
      const authChain = { type: 'auth', data: 'test' }
      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))

      // Get the updated authenticated data
      authData = mockWs.getUserData()

      // Clear any mocks that were called during setup
      mockWs.send.mockClear()
      mockMetrics.increment.mockClear()
    })

    afterEach(() => {
      jest.useRealTimers()
      if (authData.heartbeatInterval) {
        clearInterval(authData.heartbeatInterval)
      }
    })

    it('should handle heartbeat messages and update lastHeartbeat', async () => {
      const initialHeartbeat = authData.lastHeartbeat
      jest.advanceTimersByTime(1000)

      await wsHandlers.message(mockWs, Buffer.from('heartbeat'))

      expect(authData.lastHeartbeat).toBeGreaterThan(initialHeartbeat)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_messages_received')
    })

    it('should send heartbeat messages periodically', async () => {
      // Advance time to trigger heartbeat
      jest.advanceTimersByTime(30000) // HEARTBEAT_INTERVAL_MS

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'heartbeat' }))
    })

    it('should handle heartbeat send errors', async () => {
      // Setup error condition
      mockWs.send.mockImplementation(() => {
        throw new Error('Send failed')
      })

      // Advance time to trigger heartbeat
      jest.advanceTimersByTime(30000)

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_errors', { address: '0x123' })
    })
  })

  describe('connection timeout', () => {
    let nonAuthData: WsNotAuthenticatedUserData

    beforeEach(() => {
      nonAuthData = {
        isConnected: true,
        auth: false
      }
      mockWs.getUserData.mockReturnValue(nonAuthData)
    })

    it('should close non-authenticated connection after timeout', () => {
      wsHandlers.open(mockWs)
      jest.advanceTimersByTime(30000)

      expect(mockWs.end).toHaveBeenCalled()
    })

    it('should handle errors when closing timed out connection', () => {
      mockWs.end.mockImplementation(() => {
        throw new Error('Close failed')
      })

      wsHandlers.open(mockWs)
      jest.advanceTimersByTime(30000)

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_errors')
    })
  })

  describe('cleanup on close', () => {
    it('should cleanup authenticated connection resources', () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: true,
        auth: true,
        address: '0x123',
        eventEmitter: mitt(),
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0,
        heartbeatInterval: setInterval(() => {}, 1000),
        reconnectTimeout: setTimeout(() => {}, 1000)
      }
      mockWs.getUserData.mockReturnValue(authData)

      wsHandlers.close(mockWs, 1000)

      expect(authData.isConnected).toBe(false)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_connections', { address: '0x123' })
    })

    it('should cleanup non-authenticated connection resources', () => {
      const nonAuthData: WsNotAuthenticatedUserData = {
        isConnected: true,
        auth: false,
        timeout: setTimeout(() => {}, 1000)
      }
      mockWs.getUserData.mockReturnValue(nonAuthData)

      wsHandlers.close(mockWs, 1000)

      expect(nonAuthData.isConnected).toBe(false)
      expect(nonAuthData.timeout).toBeUndefined()
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_connections')
    })
  })

  describe('reconnection mechanism', () => {
    let authData: WsAuthenticatedUserData

    beforeEach(async () => {
      jest.useFakeTimers()
      const now = Date.now()
      jest.setSystemTime(now)

      // Setup authenticated connection
      ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })
      const nonAuthData = {
        isConnected: true,
        auth: false
      } as WsNotAuthenticatedUserData
      mockWs.getUserData.mockReturnValue(nonAuthData)

      const authChain = { type: 'auth', data: 'test' }
      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))
      authData = mockWs.getUserData()

      // Set initial heartbeat and ensure heartbeat interval is set
      authData.lastHeartbeat = now
      mockWs.getUserData.mockReturnValue(authData)

      // Clear mocks after setup
      mockWs.send.mockClear()
      mockMetrics.increment.mockClear()
    })

    afterEach(() => {
      jest.useRealTimers()
      // No need to manually clear intervals as jest.useRealTimers() handles cleanup
    })

    it('should handle heartbeat timeout and trigger reconnection', async () => {
      // Make reconnection fail
      mockRpcServer.attachUser.mockImplementationOnce(() => {
        throw new Error('Reconnection failed')
      })

      // Move time forward past the heartbeat timeout
      jest.setSystemTime(Date.now() + HEARTBEAT_TIMEOUT_MS + 1000)

      // Trigger the next heartbeat interval check
      jest.runOnlyPendingTimers()

      // Allow any promises to resolve
      await Promise.resolve()

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_heartbeats_missed', { address: '0x123' })
      expect(authData.isConnected).toBe(false)
    })

    it('should handle reconnection failure and increment attempts', async () => {
      // Make attachUser fail on reconnection
      mockRpcServer.attachUser.mockImplementationOnce(() => {
        throw new Error('Reconnection failed')
      })

      // Trigger heartbeat timeout and reconnection
      jest.setSystemTime(Date.now() + HEARTBEAT_TIMEOUT_MS + 1000)
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_errors', { address: '0x123' })
      expect(authData.reconnectAttempts).toBeGreaterThan(0)
    })

    it.skip('should clear existing heartbeat interval when setting up new one', async () => {
      // Create a mock interval
      const mockInterval = {
        unref: jest.fn(),
        ref: jest.fn(),
        refresh: jest.fn(),
        [Symbol.toPrimitive]: jest.fn()
      }
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

      // Set up initial heartbeat interval
      // authData.heartbeatInterval = mockInterval

      // Send a heartbeat message to trigger new heartbeat setup
      await wsHandlers.message(mockWs, Buffer.from('heartbeat'))

      // Advance timers to trigger the heartbeat interval
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

      expect(clearIntervalSpy).toHaveBeenCalledWith(mockInterval)
      clearIntervalSpy.mockRestore()
    })

    it('should clear existing reconnect timeout when starting reconnection', async () => {
      const mockTimeout = {
        unref: jest.fn(),
        ref: jest.fn(),
        [Symbol.toPrimitive]: jest.fn()
      }
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

      // @ts-ignore - mock timeout
      authData.reconnectTimeout = mockTimeout

      // Trigger heartbeat timeout and reconnection
      jest.setSystemTime(Date.now() + HEARTBEAT_TIMEOUT_MS + 1000)
      jest.runOnlyPendingTimers()

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeout)
      clearTimeoutSpy.mockRestore()
    })

    it('should clear event emitter before attempting reconnection', async () => {
      const clearSpy = jest.spyOn(authData.eventEmitter.all, 'clear')

      // Make reconnection fail
      mockRpcServer.attachUser.mockImplementationOnce(() => {
        throw new Error('Reconnection failed')
      })

      // Trigger heartbeat timeout and reconnection
      jest.setSystemTime(Date.now() + HEARTBEAT_TIMEOUT_MS + 1000)
      jest.runOnlyPendingTimers()

      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    })

    it('should reset reconnect attempts on successful reconnection', async () => {
      authData.reconnectAttempts = 2

      // Trigger heartbeat timeout and reconnection
      jest.setSystemTime(Date.now() + HEARTBEAT_TIMEOUT_MS + 1000)
      jest.runOnlyPendingTimers()

      expect(authData.reconnectAttempts).toBe(0)
    })
  })

  describe('authenticated message handling', () => {
    let authData: WsAuthenticatedUserData

    beforeEach(async () => {
      // Setup authenticated connection
      ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })
      const nonAuthData = {
        isConnected: true,
        auth: false
      } as WsNotAuthenticatedUserData
      mockWs.getUserData.mockReturnValue(nonAuthData)

      const authChain = { type: 'auth', data: 'test' }
      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))
      authData = mockWs.getUserData()

      // Mock eventEmitter.emit to be a jest function
      authData.eventEmitter.emit = jest.fn()
      mockWs.getUserData.mockReturnValue(authData)

      mockWs.send.mockClear()
      mockMetrics.increment.mockClear()
    })

    it('should handle message when connection is marked as disconnected', async () => {
      authData.isConnected = false

      await wsHandlers.message(mockWs, Buffer.from('test message'))

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_messages_received')
      expect(authData.eventEmitter.emit).not.toHaveBeenCalled()
    })

    it('should handle error when emitting message', async () => {
      const errorMessage = 'Emit error'
      authData.eventEmitter.emit = jest.fn().mockImplementation(() => {
        throw new Error(errorMessage)
      })

      await wsHandlers.message(mockWs, Buffer.from('test message'))

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_errors', { address: '0x123' })
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Error processing message', message: errorMessage })
      )
    })
  })

  describe('authentication error handling', () => {
    beforeEach(() => {
      const nonAuthData = {
        isConnected: true,
        auth: false
      } as WsNotAuthenticatedUserData
      mockWs.getUserData.mockReturnValue(nonAuthData)
    })

    it('should handle invalid auth chain message', async () => {
      const invalidAuthChain = 'invalid json'
      await wsHandlers.message(mockWs, Buffer.from(invalidAuthChain))

      expect(mockWs.close).toHaveBeenCalled()
    })

    it('should handle verification failure', async () => {
      ;(verify as jest.Mock).mockRejectedValue(new Error('Verification failed'))

      const authChain = { type: 'auth', data: 'test' }
      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify(authChain)))

      expect(mockWs.close).toHaveBeenCalled()
    })

    it('should handle empty or malformed auth chain', async () => {
      await wsHandlers.message(mockWs, Buffer.from(''))
      expect(mockWs.close).toHaveBeenCalled()
    })

    it('should handle non-string auth chain', async () => {
      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ invalid: 'format' })))
      expect(mockWs.close).toHaveBeenCalled()
    })
  })

  describe('message handler edge cases', () => {
    it('should handle undefined eventEmitter during message processing', async () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: true,
        auth: true,
        address: '0x123',
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0
      } as WsAuthenticatedUserData // Intentionally missing eventEmitter

      mockWs.getUserData.mockReturnValue(authData)

      await wsHandlers.message(mockWs, Buffer.from('test message'))

      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_errors', { address: '0x123' })
    })
  })
})

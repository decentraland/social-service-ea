import mitt from 'mitt'
import { verify } from '@dcl/platform-crypto-middleware'
import { registerWsHandler } from '../../../../src/controllers/handlers/uws/ws-handler'
import { mockLogs, mockMetrics, mockFetcher, mockUWs, mockConfig, mockRpcServer } from '../../../mocks/components'
import { WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../../src/types'
import { mockTracing } from '../../../mocks/components/tracing'
import { createWsPoolMockedComponent } from '../../../mocks/components/ws-pool'
import { IWsPoolComponent } from '../../../../src/logic/ws-pool'

jest.mock('@dcl/platform-crypto-middleware')

const WS_AUTH_TIMEOUT_IN_MS = 30000

describe('ws-handler', () => {
  let wsHandlers: any
  let mockWs: any
  let mockData: WsUserData
  let mockRes: any
  let mockReq: any
  let mockContext: any
  let mockWsPool: jest.Mocked<IWsPoolComponent>
  let registerConnection: jest.MockedFunction<IWsPoolComponent['registerConnection']>
  let unregisterConnection: jest.MockedFunction<IWsPoolComponent['unregisterConnection']>

  beforeEach(async () => {
    mockData = {
      isConnected: false,
      auth: false,
      wsConnectionId: 'test-client-id'
    } as WsNotAuthenticatedUserData
    registerConnection = jest.fn()
    unregisterConnection = jest.fn()

    mockWs = {
      getUserData: jest.fn().mockReturnValue(mockData),
      send: jest.fn(),
      end: jest.fn(),
      close: jest.fn(),
      getBufferedAmount: jest.fn()
    }

    mockWsPool = createWsPoolMockedComponent({
      registerConnection,
      unregisterConnection
    })

    mockRes = { upgrade: jest.fn() }
    mockReq = {
      getMethod: jest.fn().mockReturnValue('GET'),
      getHeader: jest.fn().mockImplementation(
        (header) =>
          ({
            'sec-websocket-key': 'test-key',
            'sec-websocket-protocol': 'test-protocol',
            'sec-websocket-extensions': 'test-extensions'
          })[header]
      )
    }
    mockContext = {}

    mockConfig.getNumber.mockImplementation(
      async (key) =>
        ({
          WS_AUTH_TIMEOUT_IN_MS
        })[key] || null
    )

    await registerWsHandler({
      logs: mockLogs,
      uwsServer: mockUWs,
      metrics: mockMetrics,
      fetcher: mockFetcher,
      rpcServer: mockRpcServer,
      config: mockConfig,
      tracing: mockTracing,
      wsPool: mockWsPool
    })

    wsHandlers = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))
  })

  describe('upgrade handler', () => {
    it('should upgrade connection with initial state', () => {
      wsHandlers.upgrade(mockRes, mockReq, mockContext)

      expect(mockRes.upgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          isConnected: false,
          auth: false,
          wsConnectionId: expect.any(String),
          transport: null
        }),
        'test-key',
        'test-protocol',
        'test-extensions',
        mockContext
      )
    })
  })

  describe('open handler', () => {
    it('should register the connection and update state', async () => {
      await wsHandlers.open(mockWs)
      expect(registerConnection).toHaveBeenCalledWith(mockWs)
      expect(mockData.isConnected).toBe(true)
      expect(mockData.connectionStartTime).toBeDefined()
    })

    it('should set a timeout for non-authenticated connections', async () => {
      jest.useFakeTimers()

      await wsHandlers.open(mockWs)

      expect(mockWs.getUserData().timeout).toBeDefined()

      jest.advanceTimersByTime(WS_AUTH_TIMEOUT_IN_MS)
      expect(mockWs.end).toHaveBeenCalled()
      jest.useRealTimers()
    })
  })

  describe('message handler', () => {
    it('should reject messages when authentication is in progress', async () => {
      const userData = mockWs.getUserData()
      userData.authenticating = true

      await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })))

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Authentication already in progress, please try again later' })
      )
      expect(verify).not.toHaveBeenCalled()
    })

    describe('for authenticated users', () => {
      let authData: WsAuthenticatedUserData

      beforeEach(() => {
        authData = {
          isConnected: true,
          auth: true,
          address: '0x123',
          wsConnectionId: 'test-client-id',
          eventEmitter: mitt(),
          transport: { close: jest.fn() } as any,
          connectionStartTime: Date.now(),
          authenticating: false
        }
        jest.spyOn(authData.eventEmitter, 'emit')
        mockWs.getUserData.mockReturnValue(authData)
      })

      it('should process the message', async () => {
        const testMessage = Buffer.from('test message')
        await wsHandlers.message(mockWs, testMessage)

        expect(authData.eventEmitter.emit).toHaveBeenCalledWith('message', testMessage)
      })

      it('should not process message when disconnected', async () => {
        authData.isConnected = false
        await wsHandlers.message(mockWs, Buffer.from('test message'))

        expect(authData.eventEmitter.emit).not.toHaveBeenCalled()
      })

      it('should handle message emission errors', async () => {
        const error = new Error('Emission failed')
        jest.spyOn(authData.eventEmitter, 'emit').mockImplementationOnce(() => {
          throw error
        })

        await wsHandlers.message(mockWs, Buffer.from('test message'))

        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            error: 'Error processing message',
            message: error.message
          })
        )
      })

      it('should ignore messages when connection is marked as disconnected', async () => {
        authData.isConnected = false
        const testMessage = Buffer.from('test message')

        await wsHandlers.message(mockWs, testMessage)

        expect(authData.eventEmitter.emit).not.toHaveBeenCalled()
      })
    })

    describe('for non-authenticated users', () => {
      beforeEach(() => {
        mockWs.getUserData.mockReturnValue({
          isConnected: true,
          auth: false,
          wsConnectionId: 'test-client-id'
        } as WsNotAuthenticatedUserData)
      })

      it('should handle successful authentication', async () => {
        ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })

        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })))

        const updatedData = mockWs.getUserData()
        expect(updatedData.auth).toBe(true)
        expect(updatedData.address).toBe('0x123')
        expect(updatedData.transport).toBeDefined()
        expect(updatedData.authenticating).toBe(false)
        expect(mockRpcServer.attachUser).toHaveBeenCalledWith({
          transport: expect.any(Object),
          address: '0x123'
        })
      })

      it('should handle authentication failure', async () => {
        ;(verify as jest.Mock).mockRejectedValue(new Error('Invalid auth chain'))

        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })))

        const updatedData = mockWs.getUserData()
        expect(updatedData.authenticating).toBe(false)
        expect(updatedData.auth).toBe(false)
        expect(mockWs.close).toHaveBeenCalled()
      })

      it('should clear timeout when user authenticates', async () => {
        const mockTimeout = setTimeout(() => {}, 1000)
        const userData = mockWs.getUserData()
        userData.timeout = mockTimeout
        ;(verify as jest.Mock).mockResolvedValue({ auth: '0x123' })

        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })))

        expect(mockWs.getUserData().timeout).toBeUndefined()

        clearTimeout(mockTimeout)
      })
    })
  })

  describe('close handler', () => {
    it('should cleanup authenticated connection', async () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: true,
        auth: true,
        address: '0x123',
        eventEmitter: mitt(),
        wsConnectionId: 'test-client-id',
        transport: { close: jest.fn() } as any,
        connectionStartTime: Date.now(),
        authenticating: false
      }
      mockWs.getUserData.mockReturnValue(authData)

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(authData.transport.close).toHaveBeenCalled()
      expect(mockRpcServer.detachUser).toHaveBeenCalledWith('0x123')
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_close_codes', { code: 1000 })
      expect(unregisterConnection).toHaveBeenCalledWith(authData)
      expect(authData.connectionStartTime).toBeDefined()
      expect(authData.isConnected).toBe(false)
      expect(authData.auth).toBe(false)
      expect(authData.authenticating).toBe(false)
    })

    it('should cleanup non-authenticated connection', async () => {
      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(unregisterConnection).toHaveBeenCalledWith(mockData)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_close_codes', { code: 1000 })
      expect(mockData.isConnected).toBe(false)
      expect(mockData.auth).toBe(false)
      expect(mockData.authenticating).toBe(false)
    })

    it('should handle cleanup errors gracefully', async () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: true,
        auth: true,
        address: '0x123',
        eventEmitter: mitt(),
        wsConnectionId: 'test-client-id',
        transport: {
          close: jest.fn().mockImplementationOnce(() => {
            throw new Error('Cleanup failed')
          })
        } as any,
        connectionStartTime: Date.now(),
        authenticating: false
      }
      mockWs.getUserData.mockReturnValue(authData)

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(unregisterConnection).toHaveBeenCalledWith(authData)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_close_codes', { code: 1000 })
      expect(authData.isConnected).toBe(false)
      expect(authData.auth).toBe(false)
      expect(authData.authenticating).toBe(false)
    })

    it('should clear timeout for non-authenticated connections', async () => {
      const mockTimeout = setTimeout(() => {}, 1000)
      const userData = mockWs.getUserData()
      userData.timeout = mockTimeout

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(mockWs.getUserData().timeout).toBeUndefined()
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_close_codes', { code: 1000 })
      clearTimeout(mockTimeout)
    })
  })

  describe('drain handler', () => {
    it('should increment drain event', () => {
      wsHandlers.drain(mockWs)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_drain_events')
    })
  })
})

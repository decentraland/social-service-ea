import mitt from 'mitt'
import { verify } from '@dcl/platform-crypto-middleware'
import { registerWsHandler, THREE_MINUTES_IN_MS } from '../../../../src/controllers/handlers/ws-handler'
import {
  mockLogs,
  mockMetrics,
  mockFetcher,
  mockUWs,
  mockConfig,
  mockRpcServer,
  mockWsPool
} from '../../../mocks/components'
import { WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../../src/types'

jest.mock('@dcl/platform-crypto-middleware')

describe('ws-handler', () => {
  let wsHandlers: any
  let mockWs: any
  let mockData: WsUserData
  let mockRes: any
  let mockReq: any
  let mockContext: any

  beforeEach(async () => {
    mockData = {
      isConnected: false,
      auth: false,
      wsConnectionId: 'test-client-id'
    } as WsNotAuthenticatedUserData

    mockWs = {
      getUserData: jest.fn().mockReturnValue(mockData),
      send: jest.fn(),
      end: jest.fn(),
      close: jest.fn()
    }

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

    await registerWsHandler({
      logs: mockLogs,
      server: mockUWs,
      metrics: mockMetrics,
      fetcher: mockFetcher,
      rpcServer: mockRpcServer,
      config: mockConfig,
      wsPool: mockWsPool
    })

    wsHandlers = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
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
    it('should acquire connection and update state', async () => {
      await wsHandlers.open(mockWs)
      expect(mockWsPool.acquireConnection).toHaveBeenCalledWith('test-client-id')
      expect(mockData.isConnected).toBe(true)
      expect(mockData.connectionStartTime).toBeDefined()
    })

    it('should handle connection acquisition failure', async () => {
      mockWsPool.acquireConnection.mockRejectedValueOnce(new Error('Connection limit reached'))
      await wsHandlers.open(mockWs)
      expect(mockWs.end).toHaveBeenCalledWith(1013, 'Unable to acquire connection')
    })

    it('should set a timeout for non-authenticated connections', async () => {
      jest.useFakeTimers()

      await wsHandlers.open(mockWs)

      expect(mockWs.getUserData().timeout).toBeDefined()

      jest.advanceTimersByTime(THREE_MINUTES_IN_MS)
      expect(mockWs.end).toHaveBeenCalled()
      jest.useRealTimers()
    })
  })

  describe('message handler', () => {
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
          connectionStartTime: Date.now()
        }
        jest.spyOn(authData.eventEmitter, 'emit')
        mockWs.getUserData.mockReturnValue(authData)
      })

      it('should process message and update activity', async () => {
        const testMessage = Buffer.from('test message')
        await wsHandlers.message(mockWs, testMessage)

        expect(authData.eventEmitter.emit).toHaveBeenCalledWith('message', testMessage)
        expect(mockWsPool.updateActivity).toHaveBeenCalledWith('test-client-id')
      })

      it('should not process message when disconnected', async () => {
        authData.isConnected = false
        await wsHandlers.message(mockWs, Buffer.from('test message'))

        expect(authData.eventEmitter.emit).not.toHaveBeenCalled()
        expect(mockWsPool.updateActivity).not.toHaveBeenCalled()
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
        authData.isConnected = false;
        const testMessage = Buffer.from('test message');
        
        await wsHandlers.message(mockWs, testMessage);
        
        expect(authData.eventEmitter.emit).not.toHaveBeenCalled();
        expect(mockWsPool.updateActivity).not.toHaveBeenCalled();
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
        expect(mockRpcServer.attachUser).toHaveBeenCalledWith({
          transport: expect.any(Object),
          address: '0x123'
        })
        expect(mockWsPool.updateActivity).toHaveBeenCalledWith('test-client-id')
      })

      it('should handle authentication failure', async () => {
        ;(verify as jest.Mock).mockRejectedValue(new Error('Invalid auth chain'))

        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })))

        expect(mockWs.close).toHaveBeenCalled()
      })

      it('should clear timeout when user authenticates', async () => {
        const mockTimeout = setTimeout(() => {}, 1000);
        const userData = mockWs.getUserData();
        userData.timeout = mockTimeout;
        
        (verify as jest.Mock).mockResolvedValue({ auth: '0x123' });
        
        await wsHandlers.message(mockWs, Buffer.from(JSON.stringify({ type: 'auth', data: 'test' })));

        expect(mockWs.getUserData().timeout).toBeUndefined()

        clearTimeout(mockTimeout);
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
        connectionStartTime: Date.now()
      }
      mockWs.getUserData.mockReturnValue(authData)

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(authData.transport.close).toHaveBeenCalled()
      expect(mockRpcServer.detachUser).toHaveBeenCalledWith('0x123')
      expect(mockWsPool.releaseConnection).toHaveBeenCalledWith('test-client-id')
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_connection_duration_seconds', {}, expect.any(Number))
      expect(authData.connectionStartTime).toBeDefined()
      expect(authData.isConnected).toBe(false)
      expect(authData.auth).toBe(false)
    })

    it('should cleanup non-authenticated connection', async () => {
      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(mockWsPool.releaseConnection).toHaveBeenCalledWith('test-client-id')
      expect(mockData.isConnected).toBe(false)
      expect(mockData.auth).toBe(false)
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
        connectionStartTime: Date.now()
      }
      mockWs.getUserData.mockReturnValue(authData)

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(mockWsPool.releaseConnection).toHaveBeenCalledWith('test-client-id')
      expect(authData.isConnected).toBe(false)
      expect(authData.auth).toBe(false)
    })

    it('should clear timeout for non-authenticated connections', async () => {
      const mockTimeout = setTimeout(() => {}, 1000)
      const userData = mockWs.getUserData()
      userData.timeout = mockTimeout

      await wsHandlers.close(mockWs, 1000, Buffer.from('normal closure'))

      expect(mockWs.getUserData().timeout).toBeUndefined()
      clearTimeout(mockTimeout)
    })
  })

  describe('ping handler', () => {
    it('should update connection activity', async () => {
      await wsHandlers.ping(mockWs)
      expect(mockWsPool.updateActivity).toHaveBeenCalledWith('test-client-id')
    })
  })
})

import mitt from 'mitt'
import { verify } from '@dcl/platform-crypto-middleware'
import { registerWsHandler } from '../../../../src/controllers/handlers/ws-handler'
import { mockLogs, mockMetrics, mockFetcher, mockUWs } from '../../../mocks/components'
import { WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../../src/types'

jest.mock('@dcl/platform-crypto-middleware')

describe('ws-handler', () => {
  const mockRpcServer = {
    attachUser: jest.fn(),
    detachUser: jest.fn()
  }

  let wsHandlers: any
  let mockWs: any
  let mockData: WsUserData
  let mockRes: any
  let mockReq: any
  let mockContext: any

  beforeEach(async () => {
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
      expect(mockMetrics.increment).toHaveBeenCalledWith('http_requests_total', {
        code: 101,
        handler: '/ws',
        method: 'GET'
      })
    })
  })

  describe('open handler', () => {
    it('should initialize connection state', () => {
      wsHandlers.open(mockWs)

      const data = mockWs.getUserData()
      expect(data.isConnected).toBe(true)
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_connections')
    })
  })

  describe('message handler for authenticated users', () => {
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
  })

  describe('close handler', () => {
    it('should cleanup authenticated connection and RPC resources', () => {
      const authData: WsAuthenticatedUserData = {
        isConnected: true,
        auth: true,
        address: '0x123',
        eventEmitter: mitt()
      }
      mockWs.getUserData.mockReturnValue(authData)

      wsHandlers.close(mockWs, 1000)

      expect(authData.isConnected).toBe(false)
      expect(mockRpcServer.detachUser).toHaveBeenCalledWith('0x123')
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_connections', { address: '0x123' })
    })

    it('should cleanup non-authenticated connection', () => {
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
})

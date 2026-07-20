import { WebSocket } from 'uWebSockets.js'
import { IConfigComponent, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createWsPoolComponent } from '../../../src/logic/ws-pool/component'
import { IWsPoolComponent } from '../../../src/logic/ws-pool/types'
import { WsPoolFullError } from '../../../src/logic/ws-pool/errors'
import { createLogsMockedComponent, createMockConfigComponent, mockMetrics } from '../../mocks/components'
import { WsUserData } from '../../../src/types'

let wsPool: IWsPoolComponent
let mockWebSocket: jest.Mocked<WebSocket<WsUserData>>
let mockMetricsComponent: typeof mockMetrics
let mockConfigComponent: jest.Mocked<IConfigComponent>
let mockLogger: ReturnType<typeof createLogsMockedComponent>
let mockInfo: jest.MockedFunction<ReturnType<(typeof mockLogger)['getLogger']>['info']>
let mockDebug: jest.MockedFunction<ReturnType<(typeof mockLogger)['getLogger']>['debug']>
let mockWarn: jest.MockedFunction<ReturnType<(typeof mockLogger)['getLogger']>['warn']>

beforeEach(async () => {
  mockMetricsComponent = { ...mockMetrics }
  mockConfigComponent = createMockConfigComponent({
    getNumber: jest.fn().mockResolvedValue(undefined)
  })
  mockLogger = createLogsMockedComponent({})
  mockInfo = jest.fn()
  mockDebug = jest.fn()
  mockWarn = jest.fn()
  mockLogger.getLogger = jest.fn().mockReturnValue({
    info: mockInfo,
    debug: mockDebug,
    warn: mockWarn
  })

  wsPool = await createWsPoolComponent({
    metrics: mockMetricsComponent,
    logs: mockLogger,
    config: mockConfigComponent
  })

  // Create a mock WebSocket with user data
  mockWebSocket = {
    getUserData: jest.fn(),
    end: jest.fn()
  } as unknown as jest.Mocked<WebSocket<WsUserData>>
})

describe('when registering a connection', () => {
  let wsConnectionId: string
  let wsUserData: WsUserData

  beforeEach(() => {
    wsConnectionId = 'connection-123'
    wsUserData = {
      isConnected: true,
      auth: true,
      authenticating: false,
      wsConnectionId,
      connectionStartTime: Date.now(),
      address: '0x123456789',
      eventEmitter: {} as any,
      transport: {} as any
    }
    mockWebSocket.getUserData.mockReturnValue(wsUserData)
  })

  it('should add the connection to the pool and update metrics', () => {
    wsPool.registerConnection(mockWebSocket)

    expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 1)
    expect(mockLogger.getLogger('ws-pool').debug).toHaveBeenCalledWith('Registering connection', {
      wsConnectionId,
      totalConnections: 1
    })
  })
})

describe('when registering multiple connections', () => {
  let secondWebSocket: jest.Mocked<WebSocket<WsUserData>>
  let secondWsUserData: WsUserData
  const fstConnectionId = 'connection-123'
  const sndConnectionId = 'connection-456'

  beforeEach(() => {
    mockWebSocket.getUserData.mockReturnValueOnce({
      isConnected: true,
      auth: true,
      authenticating: false,
      wsConnectionId: fstConnectionId,
      connectionStartTime: Date.now(),
      address: '0x987654321',
      eventEmitter: {} as any,
      transport: {} as any
    })

    secondWebSocket = {
      getUserData: jest.fn(),
      end: jest.fn()
    } as unknown as jest.Mocked<WebSocket<WsUserData>>

    secondWsUserData = {
      isConnected: true,
      auth: true,
      authenticating: false,
      wsConnectionId: sndConnectionId,
      connectionStartTime: Date.now(),
      address: '0x987654321',
      eventEmitter: {} as any,
      transport: {} as any
    }
    secondWebSocket.getUserData.mockReturnValue(secondWsUserData)
  })

  it('should track multiple connections correctly', () => {
    wsPool.registerConnection(mockWebSocket)
    wsPool.registerConnection(secondWebSocket)

    expect(mockMetricsComponent.observe).toHaveBeenCalledWith('ws_active_connections', {}, 1)
    expect(mockMetricsComponent.observe).toHaveBeenCalledWith('ws_active_connections', {}, 2)
    expect(mockLogger.getLogger('ws-pool').debug).toHaveBeenCalledWith('Registering connection', {
      wsConnectionId: fstConnectionId,
      totalConnections: 1
    })
    expect(mockLogger.getLogger('ws-pool').debug).toHaveBeenCalledWith('Registering connection', {
      wsConnectionId: sndConnectionId,
      totalConnections: 2
    })
  })
})

describe('when unregistering a connection', () => {
  let wsConnectionId: string
  let connectionStartTime: number
  let wsUserData: WsUserData

  beforeEach(() => {
    wsConnectionId = 'connection-123'
    connectionStartTime = Date.now() - 5000 // 5 seconds ago
    wsUserData = {
      isConnected: true,
      auth: true,
      authenticating: false,
      wsConnectionId,
      connectionStartTime,
      address: '0x123456789',
      eventEmitter: {} as any,
      transport: {} as any
    }
  })

  describe('and the connection was previously registered', () => {
    beforeEach(() => {
      mockWebSocket.getUserData.mockReturnValue(wsUserData)
      wsPool.registerConnection(mockWebSocket)
    })

    it('should remove the connection from the pool and update metrics', () => {
      wsPool.unregisterConnection(wsUserData)

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 0)
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_connection_duration_seconds', {}, expect.any(Number))
      expect(mockDebug).toHaveBeenCalledWith('Unregistering connection', {
        wsConnectionId,
        totalConnections: 0,
        durationSeconds: expect.any(Number)
      })
    })
  })

  describe('and the connection was not previously registered', () => {
    it('should still update metrics and log the unregistration', () => {
      wsPool.unregisterConnection(wsUserData)

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 0)
      expect(mockDebug).toHaveBeenCalledWith('Unregistering connection', {
        wsConnectionId,
        totalConnections: 0,
        durationSeconds: expect.any(Number)
      })
    })
  })

  describe('and the connection duration is invalid', () => {
    beforeEach(() => {
      wsUserData.connectionStartTime = NaN
    })

    it('should handle invalid duration gracefully', () => {
      wsPool.unregisterConnection(wsUserData)

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 0)
      expect(mockDebug).toHaveBeenCalledWith('Unregistering connection', {
        wsConnectionId,
        totalConnections: 0,
        durationSeconds: 'N/A'
      })
      expect(mockMetrics.observe).not.toHaveBeenCalledWith(
        'ws_connection_duration_seconds',
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('and the connection duration is infinite', () => {
    beforeEach(() => {
      wsUserData.connectionStartTime = -Infinity
    })

    it('should handle infinite duration gracefully', () => {
      wsPool.unregisterConnection(wsUserData)

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 0)
      expect(mockDebug).toHaveBeenCalledWith('Unregistering connection', {
        wsConnectionId,
        totalConnections: 0,
        durationSeconds: Infinity
      })
      expect(mockMetrics.observe).not.toHaveBeenCalledWith(
        'ws_connection_duration_seconds',
        expect.anything(),
        expect.anything()
      )
    })
  })
})

describe('when shutting down the component', () => {
  let firstWebSocket: jest.Mocked<WebSocket<WsUserData>>
  let secondWebSocket: jest.Mocked<WebSocket<WsUserData>>
  let firstWsUserData: WsUserData
  let secondWsUserData: WsUserData

  describe('and there are active connections', () => {
    beforeEach(() => {
      firstWebSocket = {
        getUserData: jest.fn(),
        end: jest.fn()
      } as unknown as jest.Mocked<WebSocket<WsUserData>>

      secondWebSocket = {
        getUserData: jest.fn(),
        end: jest.fn()
      } as unknown as jest.Mocked<WebSocket<WsUserData>>

      firstWsUserData = {
        isConnected: true,
        auth: true,
        authenticating: false,
        wsConnectionId: 'connection-1',
        connectionStartTime: Date.now(),
        address: '0x111111111',
        eventEmitter: {} as any,
        transport: {} as any
      }

      secondWsUserData = {
        isConnected: true,
        auth: true,
        authenticating: false,
        wsConnectionId: 'connection-2',
        connectionStartTime: Date.now(),
        address: '0x222222222',
        eventEmitter: {} as any,
        transport: {} as any
      }

      firstWebSocket.getUserData.mockReturnValue(firstWsUserData)
      secondWebSocket.getUserData.mockReturnValue(secondWsUserData)

      // Register connections
      wsPool.registerConnection(firstWebSocket)
      wsPool.registerConnection(secondWebSocket)
    })

    it('should end all active connections with proper close code and reason', async () => {
      await wsPool[STOP_COMPONENT]()

      expect(mockInfo).toHaveBeenCalledWith('Shutting down WebSocket pool')
      expect(mockInfo).toHaveBeenCalledWith('Shutting down connection', { wsConnectionId: 'connection-1' })
      expect(mockInfo).toHaveBeenCalledWith('Shutting down connection', { wsConnectionId: 'connection-2' })
      expect(firstWebSocket.end).toHaveBeenCalledWith(1001, 'Server shutting down')
      expect(secondWebSocket.end).toHaveBeenCalledWith(1001, 'Server shutting down')
    })
  })

  describe('and closing one connection throws', () => {
    beforeEach(() => {
      firstWebSocket = {
        getUserData: jest.fn(),
        end: jest.fn()
      } as unknown as jest.Mocked<WebSocket<WsUserData>>

      secondWebSocket = {
        getUserData: jest.fn(),
        end: jest.fn()
      } as unknown as jest.Mocked<WebSocket<WsUserData>>

      firstWsUserData = {
        isConnected: true,
        auth: true,
        authenticating: false,
        wsConnectionId: 'connection-1',
        connectionStartTime: Date.now(),
        address: '0x111111111',
        eventEmitter: {} as any,
        transport: {} as any
      }

      secondWsUserData = {
        isConnected: true,
        auth: true,
        authenticating: false,
        wsConnectionId: 'connection-2',
        connectionStartTime: Date.now(),
        address: '0x222222222',
        eventEmitter: {} as any,
        transport: {} as any
      }

      firstWebSocket.getUserData.mockReturnValue(firstWsUserData)
      secondWebSocket.getUserData.mockReturnValue(secondWsUserData)
      firstWebSocket.end.mockImplementation(() => {
        throw new Error('Invalid access of closed uWS.WebSocket/SSLWebSocket.')
      })

      wsPool.registerConnection(firstWebSocket)
      wsPool.registerConnection(secondWebSocket)
    })

    it('should still close the remaining connections', async () => {
      await wsPool[STOP_COMPONENT]()

      expect(secondWebSocket.end).toHaveBeenCalledWith(1001, 'Server shutting down')
    })
  })

  describe('and there are no active connections', () => {
    beforeEach(() => {
      firstWebSocket = {
        getUserData: jest.fn(),
        end: jest.fn()
      } as unknown as jest.Mocked<WebSocket<WsUserData>>

      firstWsUserData = {
        isConnected: true,
        auth: true,
        authenticating: false,
        wsConnectionId: 'connection-1',
        connectionStartTime: Date.now(),
        address: '0x111111111',
        eventEmitter: {} as any,
        transport: {} as any
      }

      firstWebSocket.getUserData.mockReturnValue(firstWsUserData)
      wsPool.registerConnection(firstWebSocket)
      wsPool.unregisterConnection(firstWsUserData)
    })

    it('should log shutdown without ending any connections', async () => {
      await wsPool[STOP_COMPONENT]()

      expect(mockInfo).toHaveBeenCalledWith('Shutting down WebSocket pool')
      expect(firstWebSocket.end).not.toHaveBeenCalled()
    })
  })
})

describe('when handling connection with non-authenticated user data', () => {
  let wsConnectionId: string
  let wsUserData: WsUserData

  beforeEach(() => {
    wsConnectionId = 'connection-123'
    wsUserData = {
      isConnected: true,
      auth: false,
      authenticating: true,
      wsConnectionId,
      connectionStartTime: Date.now(),
      timeout: {} as NodeJS.Timeout
    }
    mockWebSocket.getUserData.mockReturnValue(wsUserData)
  })

  it('should register and unregister non-authenticated connections correctly', () => {
    wsPool.registerConnection(mockWebSocket)
    expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 1)

    wsPool.unregisterConnection(wsUserData)
    expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 0)
  })
})

describe('when a maximum amount of concurrent connections is configured', () => {
  let firstWebSocket: jest.Mocked<WebSocket<WsUserData>>
  let secondWebSocket: jest.Mocked<WebSocket<WsUserData>>

  beforeEach(async () => {
    mockConfigComponent.getNumber.mockResolvedValueOnce(1)
    wsPool = await createWsPoolComponent({
      metrics: mockMetricsComponent,
      logs: mockLogger,
      config: mockConfigComponent
    })

    firstWebSocket = {
      getUserData: jest.fn().mockReturnValue({
        isConnected: true,
        auth: false,
        authenticating: false,
        wsConnectionId: 'connection-1',
        connectionStartTime: Date.now()
      }),
      end: jest.fn()
    } as unknown as jest.Mocked<WebSocket<WsUserData>>

    secondWebSocket = {
      getUserData: jest.fn().mockReturnValue({
        isConnected: true,
        auth: false,
        authenticating: false,
        wsConnectionId: 'connection-2',
        connectionStartTime: Date.now()
      }),
      end: jest.fn()
    } as unknown as jest.Mocked<WebSocket<WsUserData>>
  })

  describe('and the pool is not full', () => {
    it('should register the connection without throwing', () => {
      expect(() => wsPool.registerConnection(firstWebSocket)).not.toThrow()
    })
  })

  describe('and the pool is full', () => {
    beforeEach(() => {
      wsPool.registerConnection(firstWebSocket)
    })

    it('should reject the connection with a WsPoolFullError', () => {
      expect(() => wsPool.registerConnection(secondWebSocket)).toThrow(WsPoolFullError)
    })

    it('should increment the rejected connections metric', () => {
      expect(() => wsPool.registerConnection(secondWebSocket)).toThrow(WsPoolFullError)
      expect(mockMetricsComponent.increment).toHaveBeenCalledWith('ws_connections_rejected')
    })

    describe('and a connection is unregistered afterwards', () => {
      beforeEach(() => {
        wsPool.unregisterConnection(firstWebSocket.getUserData())
      })

      it('should accept new connections again', () => {
        expect(() => wsPool.registerConnection(secondWebSocket)).not.toThrow()
      })
    })
  })
})

describe('when getting the connection ids', () => {
  describe('and there are registered connections', () => {
    beforeEach(() => {
      mockWebSocket.getUserData.mockReturnValue({
        isConnected: true,
        auth: false,
        authenticating: false,
        wsConnectionId: 'connection-123',
        connectionStartTime: Date.now()
      })
      wsPool.registerConnection(mockWebSocket)
    })

    it('should return the ids of all registered connections', () => {
      expect(wsPool.getConnectionIds()).toEqual(['connection-123'])
    })
  })

  describe('and there are no registered connections', () => {
    it('should return an empty array', () => {
      expect(wsPool.getConnectionIds()).toEqual([])
    })
  })
})

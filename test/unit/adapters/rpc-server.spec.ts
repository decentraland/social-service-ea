import { createRpcServerComponent } from ' ../../../src/adapters/rpc-server'
import { IRPCServerComponent, RpcServerContext } from '../../../src/types'
import { RpcServer, Transport, createRpcServer } from '@dcl/rpc'
import {
  mockArchipelagoStats,
  mockCatalystClient,
  mockConfig,
  mockDb,
  mockLogs,
  mockNats,
  mockPubSub,
  mockRedis,
  mockUWs
} from '../../mocks/components'
import { FRIEND_STATUS_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { mockSns } from '../../mocks/components/sns'

jest.mock('@dcl/rpc', () => ({
  createRpcServer: jest.fn().mockReturnValue({
    setHandler: jest.fn(),
    attachTransport: jest.fn()
  })
}))

describe('createRpcServerComponent', () => {
  let rpcServer: IRPCServerComponent

  let rpcServerMock: jest.Mocked<RpcServer<RpcServerContext>>
  let setHandlerMock: jest.Mock, attachTransportMock: jest.Mock

  beforeEach(async () => {
    rpcServerMock = createRpcServer({
      logger: mockLogs.getLogger('rpcServer-test')
    }) as jest.Mocked<RpcServer<RpcServerContext>>

    setHandlerMock = rpcServerMock.setHandler as jest.Mock
    attachTransportMock = rpcServerMock.attachTransport as jest.Mock

    rpcServer = await createRpcServerComponent({
      logs: mockLogs,
      db: mockDb,
      pubsub: mockPubSub,
      config: mockConfig,
      server: mockUWs,
      nats: mockNats,
      archipelagoStats: mockArchipelagoStats,
      redis: mockRedis,
      catalystClient: mockCatalystClient,
      sns: mockSns
    })
  })

  it('should register all services correctly', async () => {
    expect(setHandlerMock).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('start', () => {
    it('should start the server and subscribe to pubsub updates', async () => {
      mockConfig.getNumber.mockResolvedValueOnce(8085)

      await rpcServer.start({} as any)

      expect(mockUWs.app.listen).toHaveBeenCalledWith(8085, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, expect.any(Function))
    })
  })

  describe('attachUser', () => {
    it('should attach a user and register transport events', () => {
      const mockTransport = { on: jest.fn() } as unknown as Transport
      const address = '0x123'

      rpcServer.attachUser({ transport: mockTransport, address })

      expect(mockTransport.on).toHaveBeenCalledWith('close', expect.any(Function))
    })
  })
})

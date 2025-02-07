import { createRpcServerComponent, createSubscribersContext } from '../../../src/adapters/rpc-server'
import { IRPCServerComponent, ISubscribersContext, RpcServerContext } from '../../../src/types'
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
import mitt from 'mitt'

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
  let mockTransport: Transport
  let mockEmitter: ReturnType<typeof mitt>
  let subscribersContext: ISubscribersContext
  
  beforeEach(async () => {
    subscribersContext = createSubscribersContext()

    rpcServerMock = createRpcServer({
      logger: mockLogs.getLogger('rpcServer-test')
    }) as jest.Mocked<RpcServer<RpcServerContext>>

    setHandlerMock = rpcServerMock.setHandler as jest.Mock
    attachTransportMock = rpcServerMock.attachTransport as jest.Mock

    mockEmitter = mitt()
    mockTransport = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    } as unknown as Transport

    rpcServer = await createRpcServerComponent({
      logs: mockLogs,
      db: mockDb,
      pubsub: mockPubSub,
      config: mockConfig,
      server: mockUWs,
      archipelagoStats: mockArchipelagoStats,
      catalystClient: mockCatalystClient,
      sns: mockSns,
      subscribersContext
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
      const address = '0x123'

      rpcServer.attachUser({ transport: mockTransport, address })

      expect(mockTransport.on).toHaveBeenCalledWith('close', expect.any(Function))
      expect(attachTransportMock).toHaveBeenCalledWith(mockTransport, {
        subscribersContext: expect.any(Object),
        address
      })
    })

    it('should clean up subscribers when transport closes', () => {
      const address = '0x123'

      rpcServer.attachUser({ transport: mockTransport, address })

      const closeHandler = (mockTransport.on as jest.Mock).mock.calls[0][1]

      closeHandler()

      rpcServer.detachUser(address)
    })
  })

  describe.skip('detachUser', () => {
    const address = '0x123'

    beforeEach(() => {
      rpcServer.attachUser({ transport: mockTransport, address })
    })

    it('should clean up subscriber when detaching user', () => {
      rpcServer.detachUser(address)

      rpcServer.detachUser(address)
    })

    it('should handle detaching non-existent user', () => {
      const nonExistentAddress = '0x456'

      rpcServer.detachUser(nonExistentAddress)
    })
  })
})

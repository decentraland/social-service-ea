import { createRpcServerComponent, createSubscribersContext } from '../../../src/adapters/rpc-server'
import {
  ICommsGatekeeperComponent,
  IRPCServerComponent,
  ISubscribersContext,
  RpcServerContext
} from '../../../src/types'
import { RpcServer, Transport, createRpcServer } from '@dcl/rpc'
import {
  mockCatalystClient,
  mockConfig,
  mockFriendsDB,
  mockLogs,
  mockMetrics,
  mockPubSub,
  mockUWs,
  createMockPeersStatsComponent
} from '../../mocks/components'
import {
  BLOCK_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL,
  FRIENDSHIP_UPDATES_CHANNEL
} from '../../../src/adapters/pubsub'
import { mockSns } from '../../mocks/components/sns'
import * as updates from '../../../src/logic/updates'
import { createSettingsMockedComponent } from '../../mocks/components/settings'
import { createVoiceMockedComponent } from '../../mocks/components/voice'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { IPeersStatsComponent } from '../../../src/logic/peers-stats'

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
  let subscribersContext: ISubscribersContext
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>
  let endIncomingOrOutgoingPrivateVoiceChatForUserMock: jest.Mock

  beforeEach(async () => {
    endIncomingOrOutgoingPrivateVoiceChatForUserMock = jest.fn()
    subscribersContext = createSubscribersContext()

    rpcServerMock = createRpcServer({
      logger: mockLogs.getLogger('rpcServer-test')
    }) as jest.Mocked<RpcServer<RpcServerContext>>

    setHandlerMock = rpcServerMock.setHandler as jest.Mock
    attachTransportMock = rpcServerMock.attachTransport as jest.Mock

    const mockCommsGatekeeper: ICommsGatekeeperComponent = createCommsGatekeeperMockedComponent({})
    const mockSettings = createSettingsMockedComponent({})
    const mockVoice = createVoiceMockedComponent({
      endIncomingOrOutgoingPrivateVoiceChatForUser: endIncomingOrOutgoingPrivateVoiceChatForUserMock
    })

    mockPeersStats = createMockPeersStatsComponent()

    mockTransport = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    } as unknown as Transport

    rpcServer = await createRpcServerComponent({
      commsGatekeeper: mockCommsGatekeeper,
      logs: mockLogs,
      friendsDb: mockFriendsDB,
      pubsub: mockPubSub,
      config: mockConfig,
      uwsServer: mockUWs,
      catalystClient: mockCatalystClient,
      sns: mockSns,
      subscribersContext,
      metrics: mockMetrics,
      settings: mockSettings,
      voice: mockVoice,
      peersStats: mockPeersStats
    })
  })

  it('should register all services correctly', async () => {
    expect(setHandlerMock).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('start', () => {
    beforeEach(() => {
      jest.spyOn(updates, 'friendshipUpdateHandler')
      jest.spyOn(updates, 'friendshipAcceptedUpdateHandler')
      jest.spyOn(updates, 'friendConnectivityUpdateHandler')
      jest.spyOn(updates, 'blockUpdateHandler')

      mockConfig.getNumber.mockResolvedValueOnce(8085)
    })

    it('should start the server and subscribe to pubsub updates', async () => {
      await rpcServer.start({} as any)

      expect(mockUWs.app.listen).toHaveBeenCalledWith(8085, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, expect.any(Function))
      expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, expect.any(Function))
    })

    it('should call the correct handlers', async () => {
      const mockLogger = mockLogs.getLogger('rpcServer-test')

      await rpcServer.start({} as any)

      expect(updates.friendshipUpdateHandler).toHaveBeenCalledWith(subscribersContext, mockLogger)
      expect(updates.friendshipAcceptedUpdateHandler).toHaveBeenCalledWith(subscribersContext, mockLogger)
      expect(updates.friendConnectivityUpdateHandler).toHaveBeenCalledWith(
        subscribersContext,
        mockLogger,
        mockFriendsDB
      )
      expect(updates.blockUpdateHandler).toHaveBeenCalledWith(subscribersContext, mockLogger)
    })
  })

  describe('attachUser', () => {
    const address = '0x123'

    it('should attach a user and register transport events', () => {
      rpcServer.attachUser({ transport: mockTransport, address })

      expect(mockTransport.on).toHaveBeenCalledWith('close', expect.any(Function))
      expect(attachTransportMock).toHaveBeenCalledWith(mockTransport, {
        subscribersContext: expect.any(Object),
        address
      })
    })

    it('should create and store a new emitter for the user', () => {
      rpcServer.attachUser({ transport: mockTransport, address })

      const subscriber = subscribersContext.getOrAddSubscriber(address)
      expect(subscriber).toBeDefined()
      expect(subscriber.all).toBeDefined()
      expect(subscribersContext.getSubscribersAddresses()).toContain(address)
    })

    it('should not override existing subscriber for the same address', () => {
      rpcServer.attachUser({ transport: mockTransport, address })
      const firstSubscriber = subscribersContext.getOrAddSubscriber(address)

      rpcServer.attachUser({ transport: mockTransport, address })
      const secondSubscriber = subscribersContext.getOrAddSubscriber(address)

      expect(secondSubscriber).toBe(firstSubscriber)
    })

    it('should clean up subscribers when transport closes', () => {
      rpcServer.attachUser({ transport: mockTransport, address })

      const closeHandler = (mockTransport.on as jest.Mock).mock.calls[0][1]

      closeHandler()

      expect(subscribersContext.getSubscribersAddresses()).not.toContain(address)
    })

    it('should maintain separate subscribers for different addresses', () => {
      const address2 = '0x456'

      rpcServer.attachUser({ transport: mockTransport, address })
      rpcServer.attachUser({ transport: mockTransport, address: address2 })

      const subscriber1 = subscribersContext.getOrAddSubscriber(address)
      const subscriber2 = subscribersContext.getOrAddSubscriber(address2)

      expect(subscriber1).not.toBe(subscriber2)
      expect(subscribersContext.getSubscribersAddresses()).toContain(address)
      expect(subscribersContext.getSubscribersAddresses()).toContain(address2)
    })
  })

  describe('detachUser', () => {
    const address = '0x123'

    beforeEach(() => {
      rpcServer.attachUser({ transport: mockTransport, address })
      endIncomingOrOutgoingPrivateVoiceChatForUserMock.mockResolvedValue(undefined)
    })

    it('should remove subscriber when detaching user', () => {
      expect(subscribersContext.getSubscribersAddresses()).toContain(address)

      rpcServer.detachUser(address)

      expect(subscribersContext.getSubscribersAddresses()).not.toContain(address)
    })

    it('should clear subscriber events when detaching', () => {
      const subscriber = subscribersContext.getOrAddSubscriber(address)
      const clearSpy = jest.spyOn(subscriber.all, 'clear')

      rpcServer.detachUser(address)

      expect(clearSpy).toHaveBeenCalled()
    })

    it('should handle detaching non-existent user', () => {
      const nonExistentAddress = '0x456'

      expect(() => rpcServer.detachUser(nonExistentAddress)).not.toThrow()
      expect(subscribersContext.getSubscribersAddresses()).not.toContain(nonExistentAddress)
    })

    it('should end the incoming or outgoing private voice chat for the user when detaching', () => {
      rpcServer.detachUser(address)
      expect(endIncomingOrOutgoingPrivateVoiceChatForUserMock).toHaveBeenCalledWith(address)
    })

    it('should handle multiple detach calls for same user', () => {
      rpcServer.detachUser(address)
      rpcServer.detachUser(address)

      expect(subscribersContext.getSubscribersAddresses()).not.toContain(address)
    })
  })
})

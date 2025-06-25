import { createRpcServerComponent, createSubscribersContext } from '../../../src/adapters/rpc-server'
import { IRPCServerComponent, ISubscribersContext, IUpdateHandlerComponent, RpcServerContext } from '../../../src/types'
import { RpcServer, Transport, createRpcServer } from '@dcl/rpc'
import { mockConfig, mockFriendsDB, mockLogs, mockMetrics, mockPubSub, mockUWs } from '../../mocks/components'
import {
  BLOCK_UPDATES_CHANNEL,
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL,
  FRIENDSHIP_UPDATES_CHANNEL,
  PRIVATE_VOICE_CHAT_UPDATES_CHANNEL
} from '../../../src/adapters/pubsub'
import { createVoiceMockedComponent } from '../../mocks/components/voice'
import { setupRpcRoutes } from '../../../src/controllers/routes/rpc.routes'
import { createMockUpdateHandlerComponent } from '../../mocks/components/updates'

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
  let endIncomingOrOutgoingPrivateVoiceChatForUserMock: jest.Mock
  let mockUpdateHandler: jest.Mocked<IUpdateHandlerComponent>

  beforeEach(async () => {
    endIncomingOrOutgoingPrivateVoiceChatForUserMock = jest.fn()
    subscribersContext = createSubscribersContext()

    rpcServerMock = createRpcServer({
      logger: mockLogs.getLogger('rpcServer-test')
    }) as jest.Mocked<RpcServer<RpcServerContext>>

    setHandlerMock = rpcServerMock.setHandler as jest.Mock
    attachTransportMock = rpcServerMock.attachTransport as jest.Mock

    const mockVoice = createVoiceMockedComponent({
      endIncomingOrOutgoingPrivateVoiceChatForUser: endIncomingOrOutgoingPrivateVoiceChatForUserMock
    })

    mockTransport = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    } as unknown as Transport

    mockUpdateHandler = createMockUpdateHandlerComponent({})

    rpcServer = await createRpcServerComponent({
      logs: mockLogs,
      pubsub: mockPubSub,
      config: mockConfig,
      uwsServer: mockUWs,
      subscribersContext,
      metrics: mockMetrics,
      voice: mockVoice,
      updateHandler: mockUpdateHandler
    })
  })

  describe('when starting the server', () => {
    beforeEach(() => {
      mockConfig.getNumber.mockResolvedValueOnce(8085)
    })

    describe('when the service creators are not set', () => {
      it('should throw an error', () => {
        expect(rpcServer.start({} as any)).rejects.toThrow(
          'Service creators must be set before starting the RPC server'
        )
      })
    })

    describe('when the service creators are set', () => {
      beforeEach(async () => {
        rpcServer.setServiceCreators(
          await setupRpcRoutes({
            logs: mockLogs,
            friendsDb: mockFriendsDB,
            pubsub: mockPubSub,
            config: mockConfig,
            uwsServer: mockUWs
          } as any)
        )
      })

      it('should register all services correctly', async () => {
        expect(setHandlerMock).toHaveBeenCalledWith(expect.any(Function))
      })

      it('should start the server and subscribe to pubsub updates', async () => {
        await rpcServer.start({} as any)

        expect(mockUWs.app.listen).toHaveBeenCalledWith(8085, expect.any(Function))
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Function))
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, expect.any(Function))
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, expect.any(Function))
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, expect.any(Function))
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(
          COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL,
          expect.any(Function)
        )
        expect(mockPubSub.subscribeToChannel).toHaveBeenCalledWith(
          PRIVATE_VOICE_CHAT_UPDATES_CHANNEL,
          expect.any(Function)
        )
      })

      it('should wire the updateHandler component to pubsub channels', async () => {
        await rpcServer.start({} as any)

        const subscribeCalls = mockPubSub.subscribeToChannel.mock.calls

        const usedHandlers = subscribeCalls.map((call) => call[1])
        const expectedHandlers = [
          mockUpdateHandler.friendshipUpdateHandler,
          mockUpdateHandler.friendshipAcceptedUpdateHandler,
          mockUpdateHandler.friendConnectivityUpdateHandler,
          mockUpdateHandler.communityMemberConnectivityUpdateHandler,
          mockUpdateHandler.blockUpdateHandler,
          mockUpdateHandler.privateVoiceChatUpdateHandler,
          mockUpdateHandler.communityMemberJoinHandler,
          mockUpdateHandler.communityMemberLeaveHandler
        ]

        expectedHandlers.forEach((handler) => {
          expect(usedHandlers).toContain(handler)
        })

        expect(subscribeCalls).toHaveLength(expectedHandlers.length)
      })
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

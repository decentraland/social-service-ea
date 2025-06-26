import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, SubscriptionEventsEmitter } from '../../../../../src/types'
import { subscribeToCommunityMemberConnectivityUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-community-member-connectivity-updates'
import { createMockUpdateHandlerComponent, mockLogs } from '../../../../mocks/components'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityMemberConnectivityUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('when subscribing to community member connectivity updates', () => {
  let subscribeToCommunityMemberConnectivityUpdates: ReturnType<
    typeof subscribeToCommunityMemberConnectivityUpdatesService
  >
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<any>
  let subscribersContext: any

  const mockUpdate = {
    communityId: 'community-1',
    memberAddress: '0x456',
    status: ConnectivityStatus.ONLINE
  }

  beforeEach(() => {
    subscribersContext = createSubscribersContext()
    mockUpdateHandler = createMockUpdateHandlerComponent({})

    subscribeToCommunityMemberConnectivityUpdates = subscribeToCommunityMemberConnectivityUpdatesService({
      components: {
        logs: mockLogs,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  describe('when the subscription has updates', () => {
    let parsedUpdate: CommunityMemberConnectivityUpdate

    beforeEach(() => {
      parsedUpdate = {
        communityId: 'community-1',
        member: { address: '0x456' },
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield parsedUpdate
      })
    })

    it('should yield the parsed community member connectivity update', async () => {
      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      const result = await generator.next()

      expect(result.value).toEqual(parsedUpdate)
      expect(result.done).toBe(false)
    })
  })

  describe('when the subscription encounters an error', () => {
    let testError: Error

    beforeEach(() => {
      testError = new Error('Test error')
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        throw testError
      })
    })

    it('should propagate the error', async () => {
      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      await expect(generator.next()).rejects.toThrow(testError)
    })
  })

  describe('when the subscription is cleaned up', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        while (true) {
          yield undefined
        }
      })
    })

    it('should properly clean up subscription on return', async () => {
      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      const result = await generator.return(undefined)

      expect(result.done).toBe(true)
    })
  })

  describe('when extracting addresses from updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          communityId: 'community-1',
          member: { address: '0x456' },
          status: ConnectivityStatus.ONLINE
        }
      })

      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should get the member address from the update', () => {
      const getAddressFromUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getAddressFromUpdate
      expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.memberAddress)
    })
  })

  describe('when filtering updates', () => {
    let mockUpdateFromOther: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
    let mockUpdateFromSelf: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']

    beforeEach(() => {
      mockUpdateFromOther = {
        communityId: 'community-1',
        memberAddress: '0x456', // different from context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateFromSelf = {
        communityId: 'community-1',
        memberAddress: '0x123', // same as context.address
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          communityId: 'community-1',
          member: { address: '0x456' },
          status: ConnectivityStatus.ONLINE
        }
      })

      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should filter updates based on member address conditions', () => {
      // Extract the shouldHandleUpdate function from the handler call
      const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

      // Verify filtering logic
      expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different address
      expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
    })
  })

  describe('when parsing updates', () => {
    let update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']

    beforeEach(() => {
      update = {
        communityId: 'community-1',
        memberAddress: '0x456',
        status: ConnectivityStatus.ONLINE
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield update
      })

      const generator = subscribeToCommunityMemberConnectivityUpdates({} as Empty, rpcContext)
      generator.next()
    })

    describe.each([
      { description: 'online', status: ConnectivityStatus.ONLINE },
      { description: 'offline', status: ConnectivityStatus.OFFLINE }
    ])('and the update has an $description status', ({ status }) => {
      beforeEach(() => {
        update.status = status
      })

      it('should parse the update correctly', () => {
        const parser = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser
        const result = parser(update)
        expect(result).toEqual({
          communityId: 'community-1',
          member: { address: '0x456' },
          status
        })
      })
    })
  })
})

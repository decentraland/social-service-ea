import { subscribeToFriendshipUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-friendship-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { Action, ICacheComponent, IRedisComponent, RpcServerContext } from '../../../../../src/types'
import { createMockUpdateHandlerComponent } from '../../../../mocks/components'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { createRedisMock } from '../../../../mocks/components/redis'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('when subscribing to friendship updates', () => {
  let subscribeToFriendshipUpdates: ReturnType<typeof subscribeToFriendshipUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<any>
  let subscribersContext: any
  let mockFriendProfile: any
  let redis: jest.Mocked<IRedisComponent & ICacheComponent>
  let logs: jest.Mocked<ILoggerComponent>

  const mockUpdate = {
    id: '1',
    from: '0x123',
    to: '0x456',
    action: Action.REQUEST,
    timestamp: Date.now()
  }

  beforeEach(() => {
    redis = createRedisMock({})
    logs = createLogsMockedComponent()
    subscribersContext = createSubscribersContext({ redis, logs })
    mockUpdateHandler = createMockUpdateHandlerComponent({})
    mockFriendProfile = createMockProfile('0x456')

    subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({
      components: {
        logs,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  describe('when the subscription has updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          action: mockUpdate.action,
          createdAt: mockUpdate.timestamp
        }
      })
    })

    it('should yield the parsed friendship update', async () => {
      const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
      const result = await generator.next()

      expect(result.value).toEqual({
        friend: parseProfileToFriend(mockFriendProfile),
        action: mockUpdate.action,
        createdAt: mockUpdate.timestamp
      })
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
      const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
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
      const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
      const result = await generator.return(undefined)

      expect(result.done).toBe(true)
    })
  })

  describe('when extracting addresses from updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          action: mockUpdate.action,
          createdAt: mockUpdate.timestamp
        }
      })

      const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should get the proper address from the update', () => {
      const getAddressFromUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getAddressFromUpdate
      expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.from)
    })
  })

  describe('when filtering updates', () => {
    let mockUpdateFromOther: any
    let mockUpdateFromSelf: any
    let mockUpdateToOther: any

    beforeEach(() => {
      mockUpdateFromOther = {
        id: '1',
        from: '0x456', // different from context.address
        to: '0x123', // same as context.address
        action: Action.REQUEST,
        timestamp: Date.now()
      }

      mockUpdateFromSelf = {
        id: '2',
        from: '0x123', // same as context.address
        to: '0x123', // same as context.address
        action: Action.REQUEST,
        timestamp: Date.now()
      }

      mockUpdateToOther = {
        id: '3',
        from: '0x456',
        to: '0x789', // different from context.address
        action: Action.REQUEST,
        timestamp: Date.now()
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield {
          friend: parseProfileToFriend(mockFriendProfile),
          action: mockUpdate.action,
          createdAt: mockUpdate.timestamp
        }
      })

      const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should filter updates based on address conditions', () => {
      // Extract the shouldHandleUpdate function from the handler call
      const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

      // Verify filtering logic
      expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different, to self
      expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
      expect(shouldHandleUpdate(mockUpdateToOther)).toBe(false) // Should not handle: to different
    })
  })
})

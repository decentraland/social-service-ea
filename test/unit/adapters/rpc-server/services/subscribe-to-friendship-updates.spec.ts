import { subscribeToFriendshipUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friendship-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { Action, RpcServerContext } from '../../../../../src/types'
import { mockCatalystClient, mockLogs } from '../../../../mocks/components'
import { createMockProfile } from '../../../../mocks/profile'
import { handleSubscriptionUpdates } from '../../../../../src/logic/updates'
import { parseCatalystProfileToProfile } from '../../../../../src/logic/friends'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'

jest.mock('../../../../../src/logic/updates')

describe('subscribeToFriendshipUpdatesService', () => {
  let subscribeToFriendshipUpdates: ReturnType<typeof subscribeToFriendshipUpdatesService>
  let rpcContext: RpcServerContext
  const subscribersContext = createSubscribersContext()
  const mockFriendProfile = createMockProfile('0x456')
  const mockHandler = handleSubscriptionUpdates as jest.Mock

  const mockUpdate = {
    id: '1',
    from: '0x123',
    to: '0x456',
    action: Action.REQUEST,
    timestamp: Date.now()
  }

  beforeEach(async () => {
    subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({
      components: {
        logs: mockLogs,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  it('should handle subscription updates', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseCatalystProfileToProfile(mockFriendProfile),
        action: mockUpdate.action,
        createdAt: mockUpdate.timestamp
      }
    })

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(result.value).toEqual({
      friend: parseCatalystProfileToProfile(mockFriendProfile),
      action: mockUpdate.action,
      createdAt: mockUpdate.timestamp
    })
    expect(result.done).toBe(false)
  })

  it('should handle errors during subscription', async () => {
    const testError = new Error('Test error')
    mockHandler.mockImplementationOnce(async function* () {
      throw testError
    })

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    await expect(generator.next()).rejects.toThrow(testError)
  })

  it('should properly clean up subscription on return', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      while (true) {
        yield undefined
      }
    })

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    const result = await generator.return(undefined)

    expect(result.done).toBe(true)
  })

  it('should get the proper address from the update', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseCatalystProfileToProfile(mockFriendProfile),
        action: mockUpdate.action,
        createdAt: mockUpdate.timestamp
      }
    })

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    const getAddressFromUpdate = mockHandler.mock.calls[0][0].getAddressFromUpdate
    expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.from)
  })

  it('should filter updates based on address conditions', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseCatalystProfileToProfile(mockFriendProfile),
        action: mockUpdate.action,
        createdAt: mockUpdate.timestamp
      }
    })

    const mockUpdateFromOther = {
      id: '1',
      from: '0x456', // different from context.address
      to: '0x123', // same as context.address
      action: Action.REQUEST,
      timestamp: Date.now()
    }

    const mockUpdateFromSelf = {
      id: '2',
      from: '0x123', // same as context.address
      to: '0x123', // same as context.address
      action: Action.REQUEST,
      timestamp: Date.now()
    }

    const mockUpdateToOther = {
      id: '3',
      from: '0x456',
      to: '0x789', // different from context.address
      action: Action.REQUEST,
      timestamp: Date.now()
    }

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    // Extract the shouldHandleUpdate function from the handler call
    const shouldHandleUpdate = mockHandler.mock.calls[0][0].shouldHandleUpdate

    // Verify filtering logic
    expect(shouldHandleUpdate(mockUpdateFromOther)).toBe(true) // Should handle: from different, to self
    expect(shouldHandleUpdate(mockUpdateFromSelf)).toBe(false) // Should not handle: from self
    expect(shouldHandleUpdate(mockUpdateToOther)).toBe(false) // Should not handle: to different
  })
})

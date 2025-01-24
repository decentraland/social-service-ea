import { subscribeToFriendshipUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friendship-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { Action, RpcServerContext } from '../../../../../src/types'
import { mockCatalystClient, mockConfig, mockLogs } from '../../../../mocks/components'
import { createMockProfile, PROFILE_IMAGES_URL } from '../../../../mocks/profile'
import { handleSubscriptionUpdates } from '../../../../../src/logic/updates'
import { parseProfileToFriend } from '../../../../../src/logic/friends'

jest.mock('../../../../../src/logic/updates')

describe('subscribeToFriendshipUpdatesService', () => {
  let subscribeToFriendshipUpdates: Awaited<ReturnType<typeof subscribeToFriendshipUpdatesService>>
  let rpcContext: RpcServerContext
  const mockFriendProfile = createMockProfile('0x456')
  const mockHandler = handleSubscriptionUpdates as jest.Mock

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(PROFILE_IMAGES_URL)

    subscribeToFriendshipUpdates = await subscribeToFriendshipUpdatesService({
      components: {
        logs: mockLogs,
        config: mockConfig,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribers: {}
    }
  })

  it('should handle subscription updates', async () => {
    const mockUpdate = {
      id: '1',
      from: '0x123',
      to: '0x456',
      action: Action.REQUEST,
      timestamp: Date.now()
    }

    mockHandler.mockImplementationOnce(async function* () {
      yield {
        friend: parseProfileToFriend(mockFriendProfile, PROFILE_IMAGES_URL),
        action: mockUpdate.action,
        createdAt: mockUpdate.timestamp
      }
    })

    const generator = subscribeToFriendshipUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(result.value).toEqual({
      friend: parseProfileToFriend(mockFriendProfile, PROFILE_IMAGES_URL),
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
})

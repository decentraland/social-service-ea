import { mockDb, mockLogs } from '../../../../mocks/components'
import { getMutualFriendsService } from '../../../../../src/adapters/rpc-server/services/get-mutual-friends'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_COUNT_PAGE_STREAM } from '../../../../../src/adapters/rpc-server/constants'
import { MutualFriendsPayload } from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'
import { RpcServerContext, AppComponents } from '../../../../../src/types'

describe('getMutualFriendsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs'>>
  let getMutualFriends: ReturnType<typeof getMutualFriendsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  const mutualFriendsRequest: MutualFriendsPayload = {
    user: { address: '0x456' }
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs }
    getMutualFriends = getMutualFriendsService({ components })
  })

  it('should return the correct list of mutual friends', async () => {
    const mockMutualFriendsGenerator = async function* () {
      yield { address: '0x789' }
      yield { address: '0xabc' }
    }
    mockDb.getMutualFriends.mockReturnValueOnce(mockMutualFriendsGenerator())

    const generator = getMutualFriends(mutualFriendsRequest, rpcContext)

    const result1 = await generator.next()
    expect(result1.value).toEqual({ users: [{ address: '0x789' }, { address: '0xabc' }] })

    const result2 = await generator.next()
    expect(result2.done).toBe(true)
  })

  it('should respect the pagination limit', async () => {
    const mockMutualFriendsGenerator = async function* () {
      for (let i = 0; i <= FRIENDSHIPS_COUNT_PAGE_STREAM; i++) {
        yield { address: `0x${i}` }
      }
    }
    mockDb.getMutualFriends.mockReturnValueOnce(mockMutualFriendsGenerator())

    const generator = getMutualFriends(mutualFriendsRequest, rpcContext)

    const result1 = await generator.next()
    expect(result1.value.users).toHaveLength(FRIENDSHIPS_COUNT_PAGE_STREAM)

    const result2 = await generator.next()
    expect(result2.value.users).toHaveLength(1)
    expect(result2.done).toBe(false)
  })

  it('should handle errors from the database gracefully', async () => {
    mockDb.getMutualFriends.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const generator = getMutualFriends(mutualFriendsRequest, rpcContext)

    await expect(generator.next()).rejects.toThrow(INTERNAL_SERVER_ERROR)
  })
})

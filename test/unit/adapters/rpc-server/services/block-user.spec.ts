import { mockCatalystClient, mockDb, mockLogs, mockPg, mockPubSub } from '../../../../mocks/components'
import { blockUserService } from '../../../../../src/adapters/rpc-server/services/block-user'
import { BlockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, Friendship, RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { PoolClient } from 'pg'
import { BLOCK_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { parseProfileToBlockedUser } from '../../../../../src/logic/blocks'

describe('blockUserService', () => {
  let blockUser: ReturnType<typeof blockUserService>
  let mockClient: jest.Mocked<PoolClient>
  let blockedAt: Date

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    blockUser = blockUserService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient, pubsub: mockPubSub }
    })

    mockClient = (await mockPg.getPool().connect()) as jest.Mocked<PoolClient>
    mockDb.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))

    blockedAt = new Date()
  })

  it('should block a user successfully, update friendship status, and record friendship action if it exists', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockDb.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseProfileToBlockedUser(mockProfile, blockedAt)
        }
      }
    })
    expect(mockDb.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockDb.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockDb.updateFriendshipStatus).toHaveBeenCalledWith(expect.any(String), false, mockClient)
    expect(mockDb.recordFriendshipAction).toHaveBeenCalledWith(
      expect.any(String),
      rpcContext.address,
      Action.BLOCK,
      null,
      mockClient
    )
  })

  it('should block a user successfully and do nothing else if friendship does not exist', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce(null)
    mockDb.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: { profile: parseProfileToBlockedUser(mockProfile, blockedAt) }
      }
    })

    expect(mockDb.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockDb.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockDb.updateFriendshipStatus).not.toHaveBeenCalled()
    expect(mockDb.recordFriendshipAction).not.toHaveBeenCalled()
  })

  it('should publish a block update event after blocking a user', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockDb.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
    await blockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
      address: blockedAddress,
      isBlocked: true
    })
  })

  it('should return internalServerError when user address is missing', async () => {
    const request: BlockUserPayload = {
      user: { address: '' }
    }

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: 'User address is missing in the request payload' }
      }
    })
    expect(mockDb.blockUser).not.toHaveBeenCalled()
  })

  it('should return internalServerError when profile is not found', async () => {
    const blockedAddress = '0x456'
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: 'Profile not found' }
      }
    })
    expect(mockDb.blockUser).not.toHaveBeenCalled()
  })

  it('should handle database errors', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }
    const error = new Error('Database error')

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.blockUser.mockRejectedValueOnce(error)

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: error.message }
      }
    })
    expect(mockLogs.getLogger('block-user-service')).toBeDefined()
  })
})

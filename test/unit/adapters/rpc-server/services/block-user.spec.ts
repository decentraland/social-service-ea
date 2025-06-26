import { mockCatalystClient, mockFriendsDB, mockLogs, mockPg, mockPubSub } from '../../../../mocks/components'
import { blockUserService } from '../../../../../src/controllers/handlers/rpc/block-user'
import { BlockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, Friendship, RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { PoolClient } from 'pg'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { parseProfileToBlockedUser } from '../../../../../src/logic/blocks'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
describe('blockUserService', () => {
  let blockUser: ReturnType<typeof blockUserService>
  let mockClient: jest.Mocked<PoolClient>
  let blockedAddress: EthAddress
  let blockedAt: Date
  let mockProfile: Profile

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    blockUser = blockUserService({
      components: { friendsDb: mockFriendsDB, logs: mockLogs, catalystClient: mockCatalystClient, pubsub: mockPubSub }
    })

    mockClient = (await mockPg.getPool().connect()) as jest.Mocked<PoolClient>
    mockFriendsDB.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))

    blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
    mockProfile = createMockProfile(blockedAddress)
    blockedAt = new Date()
  })

  it('should block a user successfully, update friendship status, and record friendship action if it exists', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseProfileToBlockedUser(mockProfile, blockedAt)
        }
      }
    })
    expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockFriendsDB.updateFriendshipStatus).toHaveBeenCalledWith(expect.any(String), false, mockClient)
    expect(mockFriendsDB.recordFriendshipAction).toHaveBeenCalledWith(
      expect.any(String),
      rpcContext.address,
      Action.BLOCK,
      null,
      mockClient
    )
  })

  it('should block a user successfully and do nothing else if friendship does not exist', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce(null)
    mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: { profile: parseProfileToBlockedUser(mockProfile, blockedAt) }
      }
    })

    expect(mockFriendsDB.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockFriendsDB.updateFriendshipStatus).not.toHaveBeenCalled()
    expect(mockFriendsDB.recordFriendshipAction).not.toHaveBeenCalled()
  })

  it('should publish a friendship update event after blocking a user if friendship exists', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
    mockFriendsDB.recordFriendshipAction.mockResolvedValueOnce('action-id')

    await blockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
      id: 'action-id',
      from: rpcContext.address,
      to: blockedAddress,
      action: Action.BLOCK,
      timestamp: blockedAt.getTime()
    })
  })

  it('should publish a block update event after blocking a user', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockFriendsDB.blockUser.mockResolvedValueOnce({ id: 'block-id', blocked_at: blockedAt })
    await blockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
      blockerAddress: rpcContext.address,
      blockedAddress,
      isBlocked: true
    })
  })

  it('should return invalidRequest when user is trying to block himself', async () => {
    const request: BlockUserPayload = {
      user: { address: rpcContext.address }
    }

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Cannot block yourself' }
      }
    })
    expect(mockFriendsDB.blockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when user address is missing', async () => {
    const request: BlockUserPayload = {
      user: { address: '' }
    }

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Invalid user address in the request payload' }
      }
    })
    expect(mockFriendsDB.blockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when user address is invalid', async () => {
    const request: BlockUserPayload = {
      user: { address: 'invalid-address' }
    }

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Invalid user address in the request payload' }
      }
    })
    expect(mockFriendsDB.blockUser).not.toHaveBeenCalled()
  })

  it('should return profileNotFound when profile is not found', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await blockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'profileNotFound',
        profileNotFound: { message: `Profile not found for address ${blockedAddress}` }
      }
    })
    expect(mockFriendsDB.blockUser).not.toHaveBeenCalled()
  })

  it('should handle database errors', async () => {
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }
    const error = new Error('Database error')

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.blockUser.mockRejectedValueOnce(error)

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

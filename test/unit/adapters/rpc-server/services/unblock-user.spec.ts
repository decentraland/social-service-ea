import { mockCatalystClient, mockFriendsDB, mockLogs, mockPg, mockPubSub } from '../../../../mocks/components'
import { unblockUserService } from '../../../../../src/controllers/handlers/rpc/unblock-user'
import { UnblockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, Friendship, RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { PoolClient } from 'pg'
import { parseProfileToBlockedUser } from '../../../../../src/logic/blocks'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { EthAddress } from '@dcl/schemas'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

describe('unblockUserService', () => {
  let unblockUser: ReturnType<typeof unblockUserService>
  let mockClient: jest.Mocked<PoolClient>
  let blockedAddress: EthAddress
  let mockProfile: Profile

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    unblockUser = unblockUserService({
      components: { friendsDb: mockFriendsDB, logs: mockLogs, catalystClient: mockCatalystClient, pubsub: mockPubSub }
    })

    mockClient = (await mockPg.getPool().connect()) as jest.Mocked<PoolClient>
    mockFriendsDB.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))

    blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
    mockProfile = createMockProfile(blockedAddress)
  })

  it('should unblock a user successfully and mark as deleted if friendship exists', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseProfileToBlockedUser(mockProfile)
        }
      }
    })
    expect(mockFriendsDB.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockFriendsDB.recordFriendshipAction).toHaveBeenCalledWith(
      expect.any(String),
      rpcContext.address,
      Action.DELETE,
      null,
      mockClient
    )
  })

  it('should unblock a user successfully and do nothing else if friendship does not exist', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce(null)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: { profile: parseProfileToBlockedUser(mockProfile) }
      }
    })

    expect(mockFriendsDB.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockFriendsDB.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockFriendsDB.recordFriendshipAction).not.toHaveBeenCalled()
  })

  it('should publish a friendship update event after unblocking a user if friendship exists', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockFriendsDB.recordFriendshipAction.mockResolvedValueOnce('action-id')

    await unblockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
      id: 'action-id',
      from: rpcContext.address,
      to: blockedAddress,
      action: Action.DELETE,
      timestamp: expect.any(Number)
    })
  })

  it('should publish a block update event after unblocking a user', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)

    await unblockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
      blockerAddress: rpcContext.address,
      blockedAddress,
      isBlocked: false
    })
  })

  it('should return invalidRequest when user is trying to unblock himself', async () => {
    const request: UnblockUserPayload = {
      user: { address: rpcContext.address }
    }

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Cannot unblock yourself' }
      }
    })
    expect(mockFriendsDB.unblockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when user address is missing', async () => {
    const request: UnblockUserPayload = {
      user: { address: '' }
    }

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Invalid user address in the request payload' }
      }
    })
    expect(mockFriendsDB.unblockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when user address is invalid', async () => {
    const request: UnblockUserPayload = {
      user: { address: 'invalid-address' }
    }

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'invalidRequest',
        invalidRequest: { message: 'Invalid user address in the request payload' }
      }
    })
    expect(mockFriendsDB.unblockUser).not.toHaveBeenCalled()
  })

  it('should return profileNotFound when profile is not found', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'profileNotFound',
        profileNotFound: { message: `Profile not found for address ${blockedAddress}` }
      }
    })
    expect(mockFriendsDB.unblockUser).not.toHaveBeenCalled()
  })

  it('should handle database errors', async () => {
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }
    const error = new Error('Database error')

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockFriendsDB.unblockUser.mockRejectedValueOnce(error)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: error.message }
      }
    })
    expect(mockLogs.getLogger('unblock-user-service')).toBeDefined()
  })
})

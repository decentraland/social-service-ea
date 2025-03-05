import { mockCatalystClient, mockDb, mockLogs, mockPg, mockPubSub } from '../../../../mocks/components'
import { unblockUserService } from '../../../../../src/adapters/rpc-server/services/unblock-user'
import { UnblockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, Friendship, RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { PoolClient } from 'pg'
import { parseProfileToBlockedUser } from '../../../../../src/logic/blocks'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'

describe('unblockUserService', () => {
  let unblockUser: ReturnType<typeof unblockUserService>
  let mockClient: jest.Mocked<PoolClient>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    unblockUser = unblockUserService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient, pubsub: mockPubSub }
    })

    mockClient = (await mockPg.getPool().connect()) as jest.Mocked<PoolClient>
    mockDb.executeTx.mockImplementationOnce(async (cb) => cb(mockClient))
  })

  it('should unblock a user successfully and mark as deleted if friendship exists', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseProfileToBlockedUser(mockProfile)
        }
      }
    })
    expect(mockDb.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockDb.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockDb.recordFriendshipAction).toHaveBeenCalledWith(
      expect.any(String),
      rpcContext.address,
      Action.DELETE,
      null,
      mockClient
    )
  })

  it('should unblock a user successfully and do nothing else if friendship does not exist', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce(null)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: { profile: parseProfileToBlockedUser(mockProfile) }
      }
    })

    expect(mockDb.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress, mockClient)
    expect(mockDb.getFriendship).toHaveBeenCalledWith([rpcContext.address, blockedAddress], mockClient)
    expect(mockDb.recordFriendshipAction).not.toHaveBeenCalled()
  })

  it('should publish a friendship update event after unblocking a user if friendship exists', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)
    mockDb.recordFriendshipAction.mockResolvedValueOnce('action-id')

    await unblockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
      id: 'action-id',
      from: rpcContext.address,
      to: blockedAddress,
      action: Action.DELETE,
      timestamp: Date.now()
    })
  })

  it('should publish a block update event after unblocking a user', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.getFriendship.mockResolvedValueOnce({ id: 'friendship-id' } as Friendship)

    await unblockUser(request, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(BLOCK_UPDATES_CHANNEL, {
      address: blockedAddress,
      isBlocked: false
    })
  })

  it('should return internalServerError when user address is missing', async () => {
    const request: UnblockUserPayload = {
      user: { address: '' }
    }

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: 'User address is missing in the request payload' }
      }
    })
    expect(mockDb.unblockUser).not.toHaveBeenCalled()
  })

  it('should return internalServerError when profile is not found', async () => {
    const blockedAddress = '0x456'
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await unblockUser(request, rpcContext)

    expect(response).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: { message: 'Profile not found' }
      }
    })
    expect(mockDb.unblockUser).not.toHaveBeenCalled()
  })

  it('should handle database errors', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }
    const error = new Error('Database error')

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.unblockUser.mockRejectedValueOnce(error)

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

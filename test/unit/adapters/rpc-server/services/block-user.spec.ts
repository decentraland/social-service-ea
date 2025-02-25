import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { blockUserService } from '../../../../../src/adapters/rpc-server/services/block-user'
import { BlockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'

describe('blockUserService', () => {
  let blockUser: ReturnType<typeof blockUserService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    blockUser = blockUserService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should block a user successfully', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)

    const response = await blockUser(request, rpcContext)

    expect(response.response.$case).toBe('blocked')
    expect(response.response.blocked.profile).toEqual({
      address: mockProfile.address,
      name: mockProfile.name,
      avatarUrl: mockProfile.avatarUrl
    })
    expect(mockDb.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress)
  })

  it('should return invalidRequest when user address is missing', async () => {
    const request: BlockUserPayload = {
      user: { address: '' }
    }

    const response = await blockUser(request, rpcContext)

    expect(response.response.$case).toBe('invalidRequest')
    expect(response.response.invalidRequest.message).toBe('User address is missing in the request payload')
    expect(mockDb.blockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when profile is not found', async () => {
    const blockedAddress = '0x456'
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await blockUser(request, rpcContext)

    expect(response.response.$case).toBe('invalidRequest')
    expect(response.response.invalidRequest.message).toBe('Profile not found')
    expect(mockDb.blockUser).not.toHaveBeenCalled()
  })

  it('should handle internal server errors', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: BlockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.blockUser.mockRejectedValueOnce(new Error('Database error'))

    const response = await blockUser(request, rpcContext)

    expect(response.response.$case).toBe('internalServerError')
    expect(response.response.internalServerError.message).toBe('Database error')
  })
})

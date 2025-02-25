import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { unblockUserService } from '../../../../../src/adapters/rpc-server/services/unblock-user'
import { UnblockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'

describe('unblockUserService', () => {
  let unblockUser: ReturnType<typeof unblockUserService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    unblockUser = unblockUserService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should unblock a user successfully', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)

    const response = await unblockUser(request, rpcContext)

    expect(response.response.$case).toBe('unblocked')
    expect(response.response.unblocked.profile).toEqual({
      address: mockProfile.address,
      name: mockProfile.name,
      avatarUrl: mockProfile.avatarUrl
    })
    expect(mockDb.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress)
  })

  it('should return invalidRequest when user address is missing', async () => {
    const request: UnblockUserPayload = {
      user: { address: '' }
    }

    const response = await unblockUser(request, rpcContext)

    expect(response.response.$case).toBe('invalidRequest')
    expect(response.response.invalidRequest.message).toBe('User address is missing in the request payload')
    expect(mockDb.unblockUser).not.toHaveBeenCalled()
  })

  it('should return invalidRequest when profile is not found', async () => {
    const blockedAddress = '0x456'
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(null)

    const response = await unblockUser(request, rpcContext)

    expect(response.response.$case).toBe('invalidRequest')
    expect(response.response.invalidRequest.message).toBe('Profile not found')
    expect(mockDb.unblockUser).not.toHaveBeenCalled()
  })

  it('should handle internal server errors', async () => {
    const blockedAddress = '0x456'
    const mockProfile = createMockProfile(blockedAddress)
    const request: UnblockUserPayload = {
      user: { address: blockedAddress }
    }

    mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
    mockDb.unblockUser.mockRejectedValueOnce(new Error('Database error'))

    const response = await unblockUser(request, rpcContext)

    expect(response.response.$case).toBe('internalServerError')
    expect(response.response.internalServerError.message).toBe('Database error')
  })
})

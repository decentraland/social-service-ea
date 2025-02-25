import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { unblockUserService } from '../../../../../src/adapters/rpc-server/services/unblock-user'
import { UnblockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'

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

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseProfileToFriend(mockProfile)
        }
      }
    })
    expect(mockDb.unblockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress)
    expect(mockLogs.getLogger('unblock-user-service')).toBeDefined()
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

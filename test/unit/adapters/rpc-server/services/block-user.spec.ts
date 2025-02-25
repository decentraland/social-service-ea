import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { blockUserService } from '../../../../../src/adapters/rpc-server/services/block-user'
import { BlockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseCatalystProfileToProfile } from '../../../../../src/logic/friends'

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

    expect(response).toEqual({
      response: {
        $case: 'ok',
        ok: {
          profile: parseCatalystProfileToProfile(mockProfile)
        }
      }
    })
    expect(mockDb.blockUser).toHaveBeenCalledWith(rpcContext.address, blockedAddress)
    expect(mockLogs.getLogger('block-user-service')).toBeDefined()
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

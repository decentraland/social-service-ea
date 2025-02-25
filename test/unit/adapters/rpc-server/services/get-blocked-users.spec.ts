import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { getBlockedUsersService } from '../../../../../src/adapters/rpc-server/services/get-blocked-users'
import { GetBlockedUsersPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'

describe('getBlockedUsersService', () => {
  let getBlockedUsers: ReturnType<typeof getBlockedUsersService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  const request: GetBlockedUsersPayload = {
    pagination: { limit: 10, offset: 0 }
  }

  beforeEach(() => {
    getBlockedUsers = getBlockedUsersService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should return blocked users with their profiles', async () => {
    const blockedAddresses = ['0x456', '0x789']
    const mockProfiles = blockedAddresses.map(createMockProfile)

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedAddresses)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: mockProfiles.map((profile) => ({
        address: profile.address,
        name: profile.name,
        avatarUrl: profile.avatarUrl
      })),
      paginationData: {
        total: blockedAddresses.length,
        page: 1
      }
    })
  })

  it('should handle empty blocked users list', async () => {
    mockDb.getBlockedUsers.mockResolvedValueOnce([])

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
    expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockDb.getBlockedUsers.mockRejectedValueOnce(new Error('Database error'))

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
  })
})

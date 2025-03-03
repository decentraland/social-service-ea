import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { getBlockedUsersService } from '../../../../../src/adapters/rpc-server/services/get-blocked-users'
import { GetBlockedUsersPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfilesToUserProfiles } from '../../../../../src/logic/friends'

describe('getBlockedUsersService', () => {
  let getBlockedUsers: ReturnType<typeof getBlockedUsersService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getBlockedUsers = getBlockedUsersService({
      components: { db: mockDb, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should return blocked users with profiles and pagination', async () => {
    const blockedAddresses = ['0x456', '0x789']
    const mockProfiles = blockedAddresses.map(createMockProfile)
    const request: GetBlockedUsersPayload = {
      pagination: { limit: 10, offset: 0 }
    }

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedAddresses)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: parseProfilesToUserProfiles(mockProfiles),
      paginationData: {
        total: blockedAddresses.length,
        page: 1
      }
    })
    expect(mockLogs.getLogger('get-blocked-users-service')).toBeDefined()
  })

  it('should use default pagination when not provided', async () => {
    const blockedAddresses = ['0x456']
    const mockProfiles = blockedAddresses.map(createMockProfile)
    const request: GetBlockedUsersPayload = {}

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedAddresses)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response.paginationData.page).toBe(1)
    expect(response.profiles).toEqual(parseProfilesToUserProfiles(mockProfiles))
  })

  it('should handle errors gracefully', async () => {
    const error = new Error('Database error')
    const request: GetBlockedUsersPayload = {}

    mockDb.getBlockedUsers.mockRejectedValueOnce(error)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: [],
      paginationData: {
        total: 0,
        page: 1
      }
    })
    expect(mockLogs.getLogger('get-blocked-users-service')).toBeDefined()
  })
})

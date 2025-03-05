import { mockCatalystClient, mockDb, mockLogs } from '../../../../mocks/components'
import { getBlockedUsersService } from '../../../../../src/adapters/rpc-server/services/get-blocked-users'
import { GetBlockedUsersPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfilesToBlockedUsers } from '../../../../../src/logic/blocks'

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
    const blockedUsers = [{ address: '0x456', blocked_at: new Date() }, { address: '0x789', blocked_at: new Date() }]
    const mockProfiles = blockedUsers.map((user) => createMockProfile(user.address))
    const request: GetBlockedUsersPayload = {
      pagination: { limit: 10, offset: 0 }
    }

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedUsers)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response).toEqual({
      profiles: parseProfilesToBlockedUsers(mockProfiles, blockedUsers),
      paginationData: {
        total: blockedUsers.length,
        page: 1
      }
    })
    expect(mockLogs.getLogger('get-blocked-users-service')).toBeDefined()
  })

  it('should use default pagination when not provided', async () => {
    const blockedUsers = [{ address: '0x456', blocked_at: new Date() }]
    const mockProfiles = blockedUsers.map((user) => createMockProfile(user.address))
    const request: GetBlockedUsersPayload = {}

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedUsers)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const response = await getBlockedUsers(request, rpcContext)

    expect(response.paginationData.page).toBe(1)
    expect(response.profiles).toEqual(parseProfilesToBlockedUsers(mockProfiles, blockedUsers))
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

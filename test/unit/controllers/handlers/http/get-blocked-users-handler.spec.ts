import { getBlockedUsersHandler } from '../../../../../src/controllers/handlers/http/get-blocked-users-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToBlockedUser } from '../../../../../src/logic/friends'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const BLOCKED_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(query = '') {
  return getBlockedUsersHandler({
    components: { friends, logs },
    url: new URL(`http://localhost/v1/blocks${query}`),
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when getting the users blocked by the caller', () => {
  let profile: ReturnType<typeof createMockProfile>
  let blockedAt: Date

  beforeEach(() => {
    profile = createMockProfile(BLOCKED_ADDRESS)
    blockedAt = new Date(1000)
    friends.getBlockedUsers.mockResolvedValue({
      blockedUsers: [{ address: BLOCKED_ADDRESS, blocked_at: blockedAt }],
      blockedProfiles: [profile],
      total: 1
    })
  })

  it('should respond with the blocked users page, including when each one was blocked', async () => {
    await expect(callHandler('?limit=5')).resolves.toEqual({
      status: 200,
      body: {
        data: {
          results: [parseProfileToBlockedUser(profile, blockedAt)],
          total: 1,
          page: 1,
          pages: 1,
          limit: 5
        }
      }
    })
  })

  it('should query the requested page', async () => {
    await callHandler('?limit=5&offset=5')

    expect(friends.getBlockedUsers).toHaveBeenCalledWith(USER_ADDRESS, { limit: 5, offset: 5 })
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getBlockedUsers.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler()).rejects.toBe(error)
  })
})

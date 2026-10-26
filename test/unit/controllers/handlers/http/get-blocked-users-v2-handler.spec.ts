import { getBlockedUsersV2Handler } from '../../../../../src/controllers/handlers/http/get-blocked-users-v2-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const BLOCKED_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(query = '') {
  return getBlockedUsersV2Handler({
    components: { friends, logs },
    url: new URL(`http://localhost/v2/blocks${query}`),
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when getting the users blocked by the caller', () => {
  beforeEach(() => {
    friends.getBlockedUsersWithoutProfiles.mockResolvedValue({
      blockedUsers: [{ address: BLOCKED_ADDRESS, blocked_at: new Date(1000) }],
      total: 1
    })
  })

  it('should respond with the blocked addresses and when each one was blocked', async () => {
    await expect(callHandler('?limit=5')).resolves.toEqual({
      status: 200,
      body: {
        data: {
          results: [{ address: BLOCKED_ADDRESS, blockedAt: 1000 }],
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

    expect(friends.getBlockedUsersWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, { limit: 5, offset: 5 })
  })

  it('should not resolve any profile', async () => {
    await callHandler()

    expect(friends.getBlockedUsers).not.toHaveBeenCalled()
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getBlockedUsersWithoutProfiles.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler()).rejects.toBe(error)
  })
})

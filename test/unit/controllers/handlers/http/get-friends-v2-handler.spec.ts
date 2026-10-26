import { getFriendsV2Handler } from '../../../../../src/controllers/handlers/http/get-friends-v2-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const FRIEND_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(query = '') {
  return getFriendsV2Handler({
    components: { friends, logs },
    url: new URL(`http://localhost/v2/friends${query}`),
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when getting the friends of the caller', () => {
  beforeEach(() => {
    friends.getFriendsWithoutProfiles.mockResolvedValue({ friends: [{ address: FRIEND_ADDRESS }], total: 3 })
  })

  it('should respond with the friend addresses and the pagination properties', async () => {
    const result = await callHandler('?limit=1&offset=1')

    expect(result).toEqual({
      status: 200,
      body: {
        data: {
          results: [{ address: FRIEND_ADDRESS }],
          total: 3,
          page: 2,
          pages: 3,
          limit: 1
        }
      }
    })
  })

  it('should query the friends of the caller with the requested page', async () => {
    await callHandler('?limit=1&offset=1')

    expect(friends.getFriendsWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, { limit: 1, offset: 1 })
  })

  it('should not resolve any profile', async () => {
    await callHandler()

    expect(friends.getFriendsProfiles).not.toHaveBeenCalled()
  })
})

describe('when no pagination is requested', () => {
  beforeEach(() => {
    friends.getFriendsWithoutProfiles.mockResolvedValue({ friends: [], total: 0 })
  })

  it('should use the default page', async () => {
    await callHandler()

    expect(friends.getFriendsWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, { limit: 100, offset: 0 })
  })
})

describe('when the friends lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getFriendsWithoutProfiles.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler()).rejects.toBe(error)
  })
})

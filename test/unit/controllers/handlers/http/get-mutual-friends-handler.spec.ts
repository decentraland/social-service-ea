import { InvalidRequestError } from '@dcl/http-commons'
import { getMutualFriendsHandler } from '../../../../../src/controllers/handlers/http/get-mutual-friends-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const MUTUAL_ADDRESS = '0x0000000000000000000000000000000000000001'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(address: string, query = '') {
  return getMutualFriendsHandler({
    components: { friends, logs },
    url: new URL(`http://localhost/v1/users/${address}/mutual-friends${query}`),
    params: { address },
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when getting the mutual friends with a valid address', () => {
  let profile: ReturnType<typeof createMockProfile>

  beforeEach(() => {
    profile = createMockProfile(MUTUAL_ADDRESS)
    friends.getMutualFriendsProfiles.mockResolvedValue({ friendsProfiles: [profile], total: 1 })
  })

  it('should respond with the mutual friends page', async () => {
    const result = await callHandler(OTHER_ADDRESS, '?limit=10')

    expect(result).toEqual({
      status: 200,
      body: {
        data: {
          results: [parseProfileToFriend(profile)],
          total: 1,
          page: 1,
          pages: 1,
          limit: 10
        }
      }
    })
  })

  it('should query the mutual friends with the normalized address', async () => {
    await callHandler(OTHER_ADDRESS.toUpperCase().replace('0X', '0x'), '?limit=10')

    expect(friends.getMutualFriendsProfiles).toHaveBeenCalledWith(USER_ADDRESS, OTHER_ADDRESS, {
      limit: 10,
      offset: 0
    })
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without querying', async () => {
    await expect(callHandler('not-an-address')).rejects.toThrow(InvalidRequestError)
    expect(friends.getMutualFriendsProfiles).not.toHaveBeenCalled()
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getMutualFriendsProfiles.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler(OTHER_ADDRESS)).rejects.toBe(error)
  })
})

import { InvalidRequestError } from '@dcl/http-commons'
import { removeFriendHandler } from '../../../../../src/controllers/handlers/http/remove-friend-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { createMockProfile } from '../../../../mocks/profile'
import { InvalidFriendshipActionError } from '../../../../../src/logic/friends/errors'
import { Action } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const FRIEND_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(address: string) {
  return removeFriendHandler({
    components: { friends, logs },
    params: { address },
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when removing a friend', () => {
  beforeEach(() => {
    friends.upsertFriendship.mockResolvedValue({
      friendshipRequest: { id: 'friendship-id', address: FRIEND_ADDRESS, timestamp: '', metadata: null },
      receiverProfile: createMockProfile(FRIEND_ADDRESS)
    })
  })

  it('should respond with a 204', async () => {
    await expect(callHandler(FRIEND_ADDRESS)).resolves.toEqual({ status: 204 })
  })

  it('should record a delete action', async () => {
    await callHandler(FRIEND_ADDRESS)

    expect(friends.upsertFriendship).toHaveBeenCalledWith(USER_ADDRESS, FRIEND_ADDRESS, Action.DELETE, null)
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler('0x123')).rejects.toThrow(InvalidRequestError)
    expect(friends.upsertFriendship).not.toHaveBeenCalled()
  })
})

describe('when the address is the caller', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler(USER_ADDRESS)).rejects.toThrow(InvalidRequestError)
    expect(friends.upsertFriendship).not.toHaveBeenCalled()
  })
})

describe('when the users are not friends', () => {
  let error: InvalidFriendshipActionError

  beforeEach(() => {
    error = new InvalidFriendshipActionError()
    friends.upsertFriendship.mockRejectedValue(error)
  })

  it('should propagate the error for the friends error handler', async () => {
    await expect(callHandler(FRIEND_ADDRESS)).rejects.toBe(error)
  })
})

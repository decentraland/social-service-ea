import { InvalidRequestError } from '@dcl/http-commons'
import { unblockUserHandler } from '../../../../../src/controllers/handlers/http/unblock-user-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { FriendshipRateLimitError } from '../../../../../src/logic/friends/errors'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const BLOCKED_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(address: string) {
  return unblockUserHandler({
    components: { friends, logs },
    params: { address },
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when unblocking a user', () => {
  beforeEach(() => {
    friends.unblockUserWithoutProfile.mockResolvedValue(undefined)
  })

  it('should respond with a 204', async () => {
    await expect(callHandler(BLOCKED_ADDRESS)).resolves.toEqual({ status: 204 })
  })

  it('should unblock the normalized address', async () => {
    await callHandler(BLOCKED_ADDRESS.toUpperCase().replace('0X', '0x'))

    expect(friends.unblockUserWithoutProfile).toHaveBeenCalledWith(USER_ADDRESS, BLOCKED_ADDRESS)
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without unblocking anyone', async () => {
    await expect(callHandler('not-an-address')).rejects.toThrow(InvalidRequestError)
    expect(friends.unblockUserWithoutProfile).not.toHaveBeenCalled()
  })
})

describe('when the caller unblocks themselves', () => {
  it('should throw an InvalidRequestError without unblocking anyone', async () => {
    await expect(callHandler(USER_ADDRESS)).rejects.toThrow('You cannot unblock yourself')
    expect(friends.unblockUserWithoutProfile).not.toHaveBeenCalled()
  })
})

describe('when the caller is rate limited', () => {
  let error: FriendshipRateLimitError

  beforeEach(() => {
    error = new FriendshipRateLimitError()
    friends.unblockUserWithoutProfile.mockRejectedValue(error)
  })

  it('should propagate the error for the friends error handler', async () => {
    await expect(callHandler(BLOCKED_ADDRESS)).rejects.toBe(error)
  })
})

import { InvalidRequestError } from '@dcl/http-commons'
import { blockUserHandler } from '../../../../../src/controllers/handlers/http/block-user-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { createMockProfile } from '../../../../mocks/profile'
import { parseAddressToBlockedUser, parseProfileToBlockedUser } from '../../../../../src/logic/friends'
import { FriendshipRateLimitError } from '../../../../../src/logic/friends/errors'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const BLOCKED_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(body: Record<string, unknown>) {
  return blockUserHandler({
    components: { friends, logs },
    request: { json: jest.fn().mockResolvedValue(body) } as any,
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when blocking a user with a profile', () => {
  let profile: ReturnType<typeof createMockProfile>
  let blockedAt: Date

  beforeEach(() => {
    profile = createMockProfile(BLOCKED_ADDRESS)
    blockedAt = new Date(1000)
    friends.blockUser.mockResolvedValue({ profile, blockedAt })
  })

  it('should respond with a 201 and the blocked user', async () => {
    await expect(callHandler({ address: BLOCKED_ADDRESS })).resolves.toEqual({
      status: 201,
      body: { data: parseProfileToBlockedUser(profile, blockedAt) }
    })
  })

  it('should block the normalized address', async () => {
    await callHandler({ address: BLOCKED_ADDRESS.toUpperCase().replace('0X', '0x') })

    expect(friends.blockUser).toHaveBeenCalledWith(USER_ADDRESS, BLOCKED_ADDRESS)
  })
})

describe('when blocking a user without a profile', () => {
  let blockedAt: Date

  beforeEach(() => {
    blockedAt = new Date(1000)
    friends.blockUser.mockResolvedValue({ profile: null, blockedAt })
  })

  it('should respond with the blocked address and no display fields', async () => {
    await expect(callHandler({ address: BLOCKED_ADDRESS })).resolves.toEqual({
      status: 201,
      body: { data: parseAddressToBlockedUser(BLOCKED_ADDRESS, blockedAt) }
    })
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without blocking anyone', async () => {
    await expect(callHandler({ address: '0x123' })).rejects.toThrow(InvalidRequestError)
    expect(friends.blockUser).not.toHaveBeenCalled()
  })
})

describe('when the caller blocks themselves', () => {
  it('should throw an InvalidRequestError without blocking anyone', async () => {
    await expect(callHandler({ address: USER_ADDRESS })).rejects.toThrow('You cannot block yourself')
    expect(friends.blockUser).not.toHaveBeenCalled()
  })
})

describe('when the caller is rate limited', () => {
  let error: FriendshipRateLimitError

  beforeEach(() => {
    error = new FriendshipRateLimitError()
    friends.blockUser.mockRejectedValue(error)
  })

  it('should propagate the error for the friends error handler', async () => {
    await expect(callHandler({ address: BLOCKED_ADDRESS })).rejects.toBe(error)
  })
})

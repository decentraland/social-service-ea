import { InvalidRequestError } from '@dcl/http-commons'
import { createFriendshipRequestHandler } from '../../../../../src/controllers/handlers/http/create-friendship-request-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { BlockedUserError } from '../../../../../src/logic/friends/errors'
import { Action } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(body: Record<string, unknown>) {
  return createFriendshipRequestHandler({
    components: { friends, logs },
    request: { json: jest.fn().mockResolvedValue(body) } as any,
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when sending a friendship request to another user', () => {
  let friendshipRequest: { id: string; address: string; timestamp: string; metadata: { message: string } | null }

  beforeEach(() => {
    friendshipRequest = {
      id: 'friendship-id',
      address: OTHER_ADDRESS,
      timestamp: new Date(0).toISOString(),
      metadata: { message: 'hi' }
    }
    friends.upsertFriendshipWithoutProfiles.mockResolvedValue(friendshipRequest)
  })

  it('should respond with a 201 and the created request, with the receiver address and no profile', async () => {
    await expect(callHandler({ address: OTHER_ADDRESS, message: 'hi' })).resolves.toEqual({
      status: 201,
      body: { data: { id: 'friendship-id', address: OTHER_ADDRESS, createdAt: 0, message: 'hi' } }
    })
  })

  it('should record a request action with the message and the normalized address', async () => {
    await callHandler({ address: OTHER_ADDRESS.toUpperCase().replace('0X', '0x'), message: 'hi' })

    expect(friends.upsertFriendshipWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, OTHER_ADDRESS, Action.REQUEST, {
      message: 'hi'
    })
  })

  describe('and there is no message', () => {
    it('should record the request without metadata', async () => {
      await callHandler({ address: OTHER_ADDRESS })

      expect(friends.upsertFriendshipWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, OTHER_ADDRESS, Action.REQUEST, null)
    })
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler({ address: '0x123' })).rejects.toThrow(InvalidRequestError)
    expect(friends.upsertFriendshipWithoutProfiles).not.toHaveBeenCalled()
  })
})

describe('when the caller sends the request to themselves', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler({ address: USER_ADDRESS })).rejects.toThrow(
      'You cannot send a friendship request to yourself'
    )
    expect(friends.upsertFriendshipWithoutProfiles).not.toHaveBeenCalled()
  })
})

describe('when the friendship is blocked', () => {
  let error: BlockedUserError

  beforeEach(() => {
    error = new BlockedUserError()
    friends.upsertFriendshipWithoutProfiles.mockRejectedValue(error)
  })

  it('should propagate the error for the friends error handler', async () => {
    await expect(callHandler({ address: OTHER_ADDRESS })).rejects.toBe(error)
  })
})

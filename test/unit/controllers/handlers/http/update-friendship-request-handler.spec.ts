import { InvalidRequestError } from '@dcl/http-commons'
import { updateFriendshipRequestHandler } from '../../../../../src/controllers/handlers/http/update-friendship-request-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { InvalidFriendshipActionError } from '../../../../../src/logic/friends/errors'
import { Action } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(address: string, body: Record<string, unknown>) {
  return updateFriendshipRequestHandler({
    components: { friends, logs },
    params: { address },
    request: { json: jest.fn().mockResolvedValue(body) } as any,
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe.each([
  ['accepted', Action.ACCEPT],
  ['rejected', Action.REJECT],
  ['cancelled', Action.CANCEL]
])('when the intention is %s', (intention, action) => {
  let friendshipRequest: { id: string; address: string; timestamp: string; metadata: null }

  beforeEach(() => {
    friendshipRequest = { id: 'friendship-id', address: OTHER_ADDRESS, timestamp: new Date(0).toISOString(), metadata: null }
    friends.upsertFriendshipWithoutProfiles.mockResolvedValue(friendshipRequest)
  })

  it('should respond with the updated request, with the other user address and no profile', async () => {
    await expect(callHandler(OTHER_ADDRESS, { intention })).resolves.toEqual({
      status: 200,
      body: { data: { id: 'friendship-id', address: OTHER_ADDRESS, createdAt: 0 } }
    })
  })

  it(`should record the ${action} action`, async () => {
    await callHandler(OTHER_ADDRESS, { intention })

    expect(friends.upsertFriendshipWithoutProfiles).toHaveBeenCalledWith(USER_ADDRESS, OTHER_ADDRESS, action, null)
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler('not-an-address', { intention: 'accepted' })).rejects.toThrow(InvalidRequestError)
    expect(friends.upsertFriendshipWithoutProfiles).not.toHaveBeenCalled()
  })
})

describe('when the address is the caller', () => {
  it('should throw an InvalidRequestError without recording anything', async () => {
    await expect(callHandler(USER_ADDRESS, { intention: 'accepted' })).rejects.toThrow(InvalidRequestError)
    expect(friends.upsertFriendshipWithoutProfiles).not.toHaveBeenCalled()
  })
})

describe('when there is no pending request the action applies to', () => {
  let error: InvalidFriendshipActionError

  beforeEach(() => {
    error = new InvalidFriendshipActionError()
    friends.upsertFriendshipWithoutProfiles.mockRejectedValue(error)
  })

  it('should propagate the error for the friends error handler', async () => {
    await expect(callHandler(OTHER_ADDRESS, { intention: 'accepted' })).rejects.toBe(error)
  })
})

import { InvalidRequestError } from '@dcl/http-commons'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getFriendshipStatusHandler } from '../../../../../src/controllers/handlers/http/get-friendship-status-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { Action } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(address: string) {
  return getFriendshipStatusHandler({
    components: { friends, logs },
    params: { address },
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when the caller sent the last friendship request', () => {
  beforeEach(() => {
    friends.getFriendshipStatus.mockResolvedValue({ action: Action.REQUEST, acting_user: USER_ADDRESS } as any)
  })

  it('should respond with the request sent status', async () => {
    await expect(callHandler(OTHER_ADDRESS)).resolves.toEqual({
      status: 200,
      body: { data: { status: FriendshipStatus.REQUEST_SENT } }
    })
  })
})

describe('when the other user sent the last friendship request', () => {
  beforeEach(() => {
    friends.getFriendshipStatus.mockResolvedValue({ action: Action.REQUEST, acting_user: OTHER_ADDRESS } as any)
  })

  it('should respond with the request received status', async () => {
    await expect(callHandler(OTHER_ADDRESS)).resolves.toEqual({
      status: 200,
      body: { data: { status: FriendshipStatus.REQUEST_RECEIVED } }
    })
  })
})

describe('when there is no friendship between the users', () => {
  beforeEach(() => {
    friends.getFriendshipStatus.mockResolvedValue(undefined)
  })

  it('should respond with the none status', async () => {
    await expect(callHandler(OTHER_ADDRESS)).resolves.toEqual({
      status: 200,
      body: { data: { status: FriendshipStatus.NONE } }
    })
  })
})

describe('when the address is not valid', () => {
  it('should throw an InvalidRequestError without querying', async () => {
    await expect(callHandler('0x123')).rejects.toThrow(InvalidRequestError)
    expect(friends.getFriendshipStatus).not.toHaveBeenCalled()
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getFriendshipStatus.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler(OTHER_ADDRESS)).rejects.toBe(error)
  })
})

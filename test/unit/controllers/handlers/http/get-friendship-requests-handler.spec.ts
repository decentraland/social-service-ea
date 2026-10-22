import { InvalidRequestError } from '@dcl/http-commons'
import { getFriendshipRequestsHandler } from '../../../../../src/controllers/handlers/http/get-friendship-requests-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { createMockProfile } from '../../../../mocks/profile'
import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../../../src/logic/friends'
import { FriendshipRequest } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler(query: string) {
  return getFriendshipRequestsHandler({
    components: { friends, logs },
    url: new URL(`http://localhost/v1/friendship-requests${query}`),
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe.each([
  ['received', 'getPendingFriendshipRequests', 'getSentFriendshipRequests'],
  ['sent', 'getSentFriendshipRequests', 'getPendingFriendshipRequests']
] as const)('when getting the %s friendship requests', (direction, queried, notQueried) => {
  let requests: FriendshipRequest[]
  let profiles: ReturnType<typeof createMockProfile>[]

  beforeEach(() => {
    requests = [
      { id: 'request-id', address: OTHER_ADDRESS, timestamp: new Date(0).toISOString(), metadata: { message: 'hi' } }
    ]
    profiles = [createMockProfile(OTHER_ADDRESS)]
    friends[queried].mockResolvedValue({ requests, profiles, total: 1 })
  })

  it('should respond with the requests page', async () => {
    await expect(callHandler(`?direction=${direction}&limit=20`)).resolves.toEqual({
      status: 200,
      body: {
        data: {
          results: parseFriendshipRequestsToFriendshipRequestResponses(requests, profiles),
          total: 1,
          page: 1,
          pages: 1,
          limit: 20
        }
      }
    })
  })

  it(`should query only the ${direction} requests`, async () => {
    await callHandler(`?direction=${direction}&limit=20`)

    expect(friends[queried]).toHaveBeenCalledWith(USER_ADDRESS, { limit: 20, offset: 0 })
    expect(friends[notQueried]).not.toHaveBeenCalled()
  })
})

describe.each([
  ['missing', ''],
  ['not supported', '?direction=pending']
])('when the direction is %s', (_, query) => {
  it('should throw an InvalidRequestError without querying', async () => {
    await expect(callHandler(query)).rejects.toThrow(InvalidRequestError)
    expect(friends.getPendingFriendshipRequests).not.toHaveBeenCalled()
    expect(friends.getSentFriendshipRequests).not.toHaveBeenCalled()
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getPendingFriendshipRequests.mockRejectedValue(error)
  })

  it('should propagate the error', async () => {
    await expect(callHandler('?direction=received')).rejects.toBe(error)
  })
})

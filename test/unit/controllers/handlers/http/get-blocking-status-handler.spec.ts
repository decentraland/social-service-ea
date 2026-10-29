import { getBlockingStatusHandler } from '../../../../../src/controllers/handlers/http/get-blocking-status-handler'
import { createFriendsMockedComponent } from '../../../../mocks/components/friends'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'

let friends: ReturnType<typeof createFriendsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>

function callHandler() {
  return getBlockingStatusHandler({
    components: { friends, logs },
    verification: { auth: USER_ADDRESS } as any
  })
}

beforeEach(() => {
  friends = createFriendsMockedComponent()
  logs = createLogsMockedComponent()
})

describe('when getting the blocking status of the caller', () => {
  beforeEach(() => {
    friends.getBlockingStatus.mockResolvedValue({ blockedUsers: ['0x1'], blockedByUsers: ['0x2', '0x3'] })
  })

  it('should respond with who the caller blocked and who blocked the caller', async () => {
    await expect(callHandler()).resolves.toEqual({
      status: 200,
      body: { data: { blockedUsers: ['0x1'], blockedByUsers: ['0x2', '0x3'] } }
    })
    expect(friends.getBlockingStatus).toHaveBeenCalledWith(USER_ADDRESS)
  })
})

describe('when the lookup fails', () => {
  let error: Error

  beforeEach(() => {
    error = new Error('database down')
    friends.getBlockingStatus.mockRejectedValue(error)
  })

  it('should propagate the error instead of reporting nobody as blocked', async () => {
    await expect(callHandler()).rejects.toBe(error)
  })
})

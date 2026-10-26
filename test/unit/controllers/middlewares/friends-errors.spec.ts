import { friendsErrorsHandler } from '../../../../src/controllers/middlewares/friends-errors'
import {
  BlockedUserError,
  FriendshipRateLimitError,
  InvalidFriendshipActionError
} from '../../../../src/logic/friends/errors'

const context = {} as any

describe('friendsErrorsHandler', () => {
  describe('when the route succeeds', () => {
    it('should return the response untouched', async () => {
      const response = { status: 200, body: { data: {} } }

      await expect(friendsErrorsHandler(context, async () => response)).resolves.toBe(response)
    })
  })

  describe('when the route throws a friends error', () => {
    const cases = [
      ['a blocked user', new BlockedUserError(), 403, 'Forbidden'],
      ['an invalid friendship action', new InvalidFriendshipActionError(), 409, 'Conflict'],
      ['a rate limited action', new FriendshipRateLimitError(), 429, 'Too Many Requests']
    ] as const

    it.each(cases)('should map %s to a %i response', async (_, error, status, label) => {
      await expect(
        friendsErrorsHandler(context, async () => {
          throw error
        })
      ).resolves.toEqual({ status, body: { error: label, message: error.message } })
    })
  })

  describe('when the route throws any other error', () => {
    it('should rethrow it for the next handler', async () => {
      const error = new Error('boom')

      await expect(
        friendsErrorsHandler(context, async () => {
          throw error
        })
      ).rejects.toBe(error)
    })
  })
})

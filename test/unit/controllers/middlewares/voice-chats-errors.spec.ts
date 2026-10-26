import { voiceChatsErrorsHandler } from '../../../../src/controllers/middlewares/voice-chats-errors'
import {
  IncomingVoiceChatNotFoundError,
  UserAlreadyInVoiceChatError,
  UserInCommunityVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatNotAllowedError,
  VoiceChatNotFoundError
} from '../../../../src/logic/voice/errors'
import {
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatResourceNotFoundError,
  CommunityVoiceChatPermissionError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  UserNotCommunityMemberError
} from '../../../../src/logic/community-voice/errors'
import { InvalidGatekeeperIdentifierError } from '../../../../src/adapters/comms-gatekeeper'

const context = {} as any

describe('voiceChatsErrorsHandler', () => {
  describe('when the route succeeds', () => {
    it('should return the response untouched', async () => {
      const response = { status: 204 }

      await expect(voiceChatsErrorsHandler(context, async () => response)).resolves.toBe(response)
    })
  })

  describe('when the route throws a voice chat error', () => {
    const cases: [string, Error, number, string][] = [
      ['a missing Gatekeeper participant', new CommunityVoiceChatResourceNotFoundError('community'), 404, 'Not Found'],
      ['a missing private call', new VoiceChatNotFoundError('call'), 404, 'Not Found'],
      ['a missing incoming call', new IncomingVoiceChatNotFoundError('0x1'), 404, 'Not Found'],
      ['a missing community call', new CommunityVoiceChatNotFoundError('community'), 404, 'Not Found'],
      ['a call between non friends', new VoiceChatNotAllowedError(), 403, 'Forbidden'],
      ['a non member', new UserNotCommunityMemberError('0x1', 'community'), 403, 'Forbidden'],
      ['a missing permission', new CommunityVoiceChatPermissionError('nope'), 403, 'Forbidden'],
      ['a user already in a call', new UserAlreadyInVoiceChatError('0x1'), 409, 'Conflict'],
      ['a user calling someone else', new UsersAreCallingSomeoneElseError(), 409, 'Conflict'],
      ['a user in a community call', new UserInCommunityVoiceChatError(true), 409, 'Conflict'],
      ['an already active community call', new CommunityVoiceChatAlreadyActiveError('community'), 409, 'Conflict'],
      ['an empty community id', new InvalidCommunityIdError(), 400, 'Bad Request'],
      ['an empty user address', new InvalidUserAddressError(), 400, 'Bad Request'],
      ['an identifier Gatekeeper refuses', new InvalidGatekeeperIdentifierError('x'), 400, 'Bad Request']
    ]

    it.each(cases)('should map %s to a %i response', async (_, error, status, label) => {
      await expect(
        voiceChatsErrorsHandler(context, async () => {
          throw error
        })
      ).resolves.toEqual({ status, body: { error: label, message: error.message } })
    })
  })

  describe('when the route throws any other error', () => {
    it('should rethrow it for the next handler', async () => {
      const error = new Error('boom')

      await expect(
        voiceChatsErrorsHandler(context, async () => {
          throw error
        })
      ).rejects.toBe(error)
    })
  })
})

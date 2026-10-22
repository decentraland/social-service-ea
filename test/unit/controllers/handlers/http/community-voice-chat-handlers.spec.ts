import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { startCommunityVoiceChatHandler } from '../../../../../src/controllers/handlers/http/start-community-voice-chat-handler'
import { endCommunityVoiceChatHandler } from '../../../../../src/controllers/handlers/http/end-community-voice-chat-handler'
import { joinCommunityVoiceChatHandler } from '../../../../../src/controllers/handlers/http/join-community-voice-chat-handler'
import { kickCommunityVoiceChatParticipantHandler } from '../../../../../src/controllers/handlers/http/kick-community-voice-chat-participant-handler'
import { promoteCommunityVoiceChatSpeakerHandler } from '../../../../../src/controllers/handlers/http/promote-community-voice-chat-speaker-handler'
import { demoteCommunityVoiceChatSpeakerHandler } from '../../../../../src/controllers/handlers/http/demote-community-voice-chat-speaker-handler'
import { muteCommunityVoiceChatSpeakerHandler } from '../../../../../src/controllers/handlers/http/mute-community-voice-chat-speaker-handler'
import { createCommunityVoiceChatSpeakRequestHandler } from '../../../../../src/controllers/handlers/http/create-community-voice-chat-speak-request-handler'
import { removeCommunityVoiceChatSpeakRequestHandler } from '../../../../../src/controllers/handlers/http/remove-community-voice-chat-speak-request-handler'
import * as moderation from '../../../../../src/logic/community-voice/moderation'
import { CommunityVoiceChatPermissionError } from '../../../../../src/logic/community-voice/errors'
import { createCommunityVoiceMockedComponent } from '../../../../mocks/components/community-voice'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'

jest.mock('../../../../../src/logic/community-voice/moderation')

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const COMMUNITY_ID = '9b7f2c1e-3d4a-4b5c-8d6e-7f8091a2b3c4'

let communityVoice: ReturnType<typeof createCommunityVoiceMockedComponent>
let commsGatekeeper: ReturnType<typeof createCommsGatekeeperMockedComponent>
let communitiesDb: any
let logs: ReturnType<typeof createLogsMockedComponent>
const verification = { auth: USER_ADDRESS } as any

beforeEach(() => {
  jest.resetAllMocks()
  communityVoice = createCommunityVoiceMockedComponent({})
  commsGatekeeper = createCommsGatekeeperMockedComponent({})
  communitiesDb = {}
  logs = createLogsMockedComponent()
})

describe('when starting a community voice chat', () => {
  function callHandler(body: Record<string, unknown>) {
    return startCommunityVoiceChatHandler({
      components: { communityVoice, logs },
      request: { json: jest.fn().mockResolvedValue(body) } as any,
      verification
    })
  }

  describe('and the community id is valid', () => {
    beforeEach(() => {
      communityVoice.startCommunityVoiceChat.mockResolvedValue({ connectionUrl: 'livekit:wss://voice?token=abc' })
    })

    it('should respond with a 201 and the credentials of the host', async () => {
      await expect(callHandler({ communityId: COMMUNITY_ID })).resolves.toEqual({
        status: 201,
        body: { data: { connectionUrl: 'livekit:wss://voice?token=abc' } }
      })
      expect(communityVoice.startCommunityVoiceChat).toHaveBeenCalledWith(COMMUNITY_ID, USER_ADDRESS)
    })
  })

  describe('and the community id is not a UUID', () => {
    it('should throw an InvalidRequestError', async () => {
      await expect(callHandler({ communityId: 'community' })).rejects.toThrow(InvalidRequestError)
      expect(communityVoice.startCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })
})

describe('when ending a community voice chat', () => {
  it('should end it on behalf of the caller and respond with a 204', async () => {
    await expect(
      endCommunityVoiceChatHandler({
        components: { communityVoice, logs },
        params: { communityId: COMMUNITY_ID },
        verification
      })
    ).resolves.toEqual({ status: 204 })
    expect(communityVoice.endCommunityVoiceChat).toHaveBeenCalledWith(COMMUNITY_ID, USER_ADDRESS)
  })
})

describe('when joining a community voice chat', () => {
  function callHandler() {
    return joinCommunityVoiceChatHandler({
      components: { communityVoice, logs },
      params: { communityId: COMMUNITY_ID },
      verification
    })
  }

  describe('and the caller can join', () => {
    beforeEach(() => {
      communityVoice.joinCommunityVoiceChat.mockResolvedValue({ connectionUrl: 'livekit:wss://voice?token=abc' })
    })

    it('should respond with a 201 and the credentials', async () => {
      await expect(callHandler()).resolves.toEqual({
        status: 201,
        body: { data: { connectionUrl: 'livekit:wss://voice?token=abc' } }
      })
    })
  })

  describe('and the caller is banned from the community', () => {
    beforeEach(() => {
      communityVoice.joinCommunityVoiceChat.mockRejectedValue(new NotAuthorizedError('banned'))
    })

    it('should reject with a permission error so it maps to a 403 instead of a 401', async () => {
      await expect(callHandler()).rejects.toThrow(CommunityVoiceChatPermissionError)
    })
  })
})

describe.each([
  ['kicking a participant', kickCommunityVoiceChatParticipantHandler, 'kickPlayerFromCommunityVoiceChat'],
  ['promoting a speaker', promoteCommunityVoiceChatSpeakerHandler, 'promoteSpeakerInCommunityVoiceChat'],
  ['demoting a speaker', demoteCommunityVoiceChatSpeakerHandler, 'demoteSpeakerInCommunityVoiceChat']
] as const)('when %s', (_, handler, moderationFunction) => {
  function callHandler(communityId: string, address: string) {
    return handler({
      components: { commsGatekeeper, communitiesDb, logs },
      params: { communityId, address },
      verification
    })
  }

  describe('and the request is valid', () => {
    it('should run the shared moderation rule for the caller and respond with a 204', async () => {
      await expect(callHandler(COMMUNITY_ID, OTHER_ADDRESS)).resolves.toEqual({ status: 204 })
      expect(moderation[moderationFunction]).toHaveBeenCalledWith(
        { commsGatekeeper, communitiesDb, logs },
        COMMUNITY_ID,
        USER_ADDRESS,
        OTHER_ADDRESS
      )
    })
  })

  describe('and the caller is not allowed to moderate', () => {
    let error: CommunityVoiceChatPermissionError

    beforeEach(() => {
      error = new CommunityVoiceChatPermissionError('Only community owners and moderators can do it')
      jest.mocked(moderation[moderationFunction]).mockRejectedValue(error)
    })

    it('should propagate the error for the voice chats error handler', async () => {
      await expect(callHandler(COMMUNITY_ID, OTHER_ADDRESS)).rejects.toBe(error)
    })
  })

  describe('and the address is not valid', () => {
    it('should throw an InvalidRequestError without moderating', async () => {
      await expect(callHandler(COMMUNITY_ID, '0x123')).rejects.toThrow(InvalidRequestError)
      expect(moderation[moderationFunction]).not.toHaveBeenCalled()
    })
  })

  describe('and the community id is not a UUID', () => {
    it('should throw an InvalidRequestError without moderating', async () => {
      await expect(callHandler('active', OTHER_ADDRESS)).rejects.toThrow(InvalidRequestError)
      expect(moderation[moderationFunction]).not.toHaveBeenCalled()
    })
  })
})

describe('when muting a speaker', () => {
  function callHandler(body: Record<string, unknown>) {
    return muteCommunityVoiceChatSpeakerHandler({
      components: { communityVoice, logs },
      params: { communityId: COMMUNITY_ID, address: OTHER_ADDRESS },
      request: { json: jest.fn().mockResolvedValue(body) } as any,
      verification
    })
  }

  it.each([true, false])('should set muted to %s and respond with a 204', async (muted) => {
    await expect(callHandler({ muted })).resolves.toEqual({ status: 204 })
    expect(communityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
      COMMUNITY_ID,
      OTHER_ADDRESS,
      USER_ADDRESS,
      muted
    )
  })
})

describe('when raising the hand', () => {
  it('should request to speak for the caller and respond with a 204', async () => {
    await expect(
      createCommunityVoiceChatSpeakRequestHandler({
        components: { communityVoice, logs },
        params: { communityId: COMMUNITY_ID },
        verification
      })
    ).resolves.toEqual({ status: 204 })
    expect(communityVoice.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(COMMUNITY_ID, USER_ADDRESS, true)
  })
})

describe('when removing a speak request', () => {
  function callHandler(address: string) {
    return removeCommunityVoiceChatSpeakRequestHandler({
      components: { communityVoice, commsGatekeeper, communitiesDb, logs },
      params: { communityId: COMMUNITY_ID, address },
      verification
    })
  }

  describe('and it is the request of the caller', () => {
    it('should lower their hand', async () => {
      await expect(callHandler(USER_ADDRESS)).resolves.toEqual({ status: 204 })
      expect(communityVoice.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
        COMMUNITY_ID,
        USER_ADDRESS,
        false
      )
      expect(moderation.rejectSpeakRequestInCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })

  describe('and it is the request of another user', () => {
    it('should reject it as a moderator', async () => {
      await expect(callHandler(OTHER_ADDRESS)).resolves.toEqual({ status: 204 })
      expect(moderation.rejectSpeakRequestInCommunityVoiceChat).toHaveBeenCalledWith(
        { commsGatekeeper, communitiesDb, logs },
        COMMUNITY_ID,
        USER_ADDRESS,
        OTHER_ADDRESS
      )
      expect(communityVoice.requestToSpeakInCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })
})

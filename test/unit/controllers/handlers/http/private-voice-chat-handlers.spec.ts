import { InvalidRequestError } from '@dcl/http-commons'
import { startPrivateVoiceChatHandler } from '../../../../../src/controllers/handlers/http/start-private-voice-chat-handler'
import { getIncomingPrivateVoiceChatHandler } from '../../../../../src/controllers/handlers/http/get-incoming-private-voice-chat-handler'
import { updatePrivateVoiceChatHandler } from '../../../../../src/controllers/handlers/http/update-private-voice-chat-handler'
import { endPrivateVoiceChatHandler } from '../../../../../src/controllers/handlers/http/end-private-voice-chat-handler'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import {
  IncomingVoiceChatNotFoundError,
  UserInCommunityVoiceChatError,
  VoiceChatNotFoundError
} from '../../../../../src/logic/voice/errors'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const CALL_ID = '4c1a9d0c-7a3f-4f5e-9a5b-0c6f1f3a2b10'

let voice: ReturnType<typeof createVoiceMockedComponent>
let commsGatekeeper: ReturnType<typeof createCommsGatekeeperMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>
const verification = { auth: USER_ADDRESS } as any

beforeEach(() => {
  voice = createVoiceMockedComponent({})
  commsGatekeeper = createCommsGatekeeperMockedComponent({})
  logs = createLogsMockedComponent()
})

describe('when starting a private voice chat', () => {
  function callHandler(body: Record<string, unknown>) {
    return startPrivateVoiceChatHandler({
      components: { voice, commsGatekeeper, logs },
      request: { json: jest.fn().mockResolvedValue(body) } as any,
      verification
    })
  }

  describe('and neither user is in a community voice chat', () => {
    beforeEach(() => {
      commsGatekeeper.isUserInCommunityVoiceChat.mockResolvedValue(false)
      voice.startPrivateVoiceChat.mockResolvedValue(CALL_ID)
    })

    it('should respond with a 201 and the id of the call', async () => {
      await expect(callHandler({ calleeAddress: OTHER_ADDRESS })).resolves.toEqual({
        status: 201,
        body: { data: { callId: CALL_ID } }
      })
      expect(voice.startPrivateVoiceChat).toHaveBeenCalledWith(USER_ADDRESS, OTHER_ADDRESS)
    })
  })

  describe('and the callee is in a community voice chat', () => {
    beforeEach(() => {
      commsGatekeeper.isUserInCommunityVoiceChat.mockImplementation(async (address) => address === OTHER_ADDRESS)
    })

    it('should reject with the conflict without starting the call', async () => {
      await expect(callHandler({ calleeAddress: OTHER_ADDRESS })).rejects.toThrow(UserInCommunityVoiceChatError)
      expect(voice.startPrivateVoiceChat).not.toHaveBeenCalled()
    })
  })

  describe('and the caller calls themselves', () => {
    it('should throw an InvalidRequestError', async () => {
      await expect(callHandler({ calleeAddress: USER_ADDRESS })).rejects.toThrow(InvalidRequestError)
      expect(voice.startPrivateVoiceChat).not.toHaveBeenCalled()
    })
  })
})

describe('when getting the incoming private voice chat', () => {
  function callHandler() {
    return getIncomingPrivateVoiceChatHandler({ components: { voice, logs }, verification })
  }

  describe('and there is one', () => {
    beforeEach(() => {
      voice.getIncomingPrivateVoiceChat.mockResolvedValue({ id: CALL_ID, caller_address: OTHER_ADDRESS } as any)
    })

    it('should respond with the call and its caller', async () => {
      await expect(callHandler()).resolves.toEqual({
        status: 200,
        body: { data: { callId: CALL_ID, callerAddress: OTHER_ADDRESS } }
      })
    })
  })

  describe('and there is none', () => {
    let error: IncomingVoiceChatNotFoundError

    beforeEach(() => {
      error = new IncomingVoiceChatNotFoundError(USER_ADDRESS)
      voice.getIncomingPrivateVoiceChat.mockRejectedValue(error)
    })

    it('should propagate the not found error for the voice chats error handler', async () => {
      await expect(callHandler()).rejects.toBe(error)
    })
  })
})

describe('when updating a private voice chat', () => {
  function callHandler(callId: string, body: Record<string, unknown>) {
    return updatePrivateVoiceChatHandler({
      components: { voice, logs },
      params: { callId },
      request: { json: jest.fn().mockResolvedValue(body) } as any,
      verification
    })
  }

  describe('and the callee accepts it', () => {
    beforeEach(() => {
      voice.acceptPrivateVoiceChat.mockResolvedValue({ connectionUrl: 'livekit:wss://voice?token=abc' })
    })

    it('should respond with the credentials to join the call', async () => {
      await expect(callHandler(CALL_ID, { intention: 'accepted' })).resolves.toEqual({
        status: 200,
        body: { data: { callId: CALL_ID, connectionUrl: 'livekit:wss://voice?token=abc' } }
      })
      expect(voice.acceptPrivateVoiceChat).toHaveBeenCalledWith(CALL_ID, USER_ADDRESS)
    })
  })

  describe('and the callee rejects it', () => {
    it('should respond with a 204', async () => {
      await expect(callHandler(CALL_ID, { intention: 'rejected' })).resolves.toEqual({ status: 204 })
      expect(voice.rejectPrivateVoiceChat).toHaveBeenCalledWith(CALL_ID, USER_ADDRESS)
      expect(voice.acceptPrivateVoiceChat).not.toHaveBeenCalled()
    })
  })

  describe('and the call id is not a UUID', () => {
    it('should throw an InvalidRequestError without touching the call', async () => {
      await expect(callHandler('not-a-uuid', { intention: 'accepted' })).rejects.toThrow(InvalidRequestError)
      expect(voice.acceptPrivateVoiceChat).not.toHaveBeenCalled()
    })
  })
})

describe('when ending a private voice chat', () => {
  function callHandler(callId: string) {
    return endPrivateVoiceChatHandler({ components: { voice, logs }, params: { callId }, verification })
  }

  describe('and the call exists', () => {
    it('should respond with a 204', async () => {
      await expect(callHandler(CALL_ID)).resolves.toEqual({ status: 204 })
      expect(voice.endPrivateVoiceChat).toHaveBeenCalledWith(CALL_ID, USER_ADDRESS)
    })
  })

  describe('and the call does not exist', () => {
    let error: VoiceChatNotFoundError

    beforeEach(() => {
      error = new VoiceChatNotFoundError(CALL_ID)
      voice.endPrivateVoiceChat.mockRejectedValue(error)
    })

    it('should propagate the not found error for the voice chats error handler', async () => {
      await expect(callHandler(CALL_ID)).rejects.toBe(error)
    })
  })

  describe('and the call id is not a UUID', () => {
    it('should throw an InvalidRequestError', async () => {
      await expect(callHandler('123')).rejects.toThrow(InvalidRequestError)
    })
  })
})

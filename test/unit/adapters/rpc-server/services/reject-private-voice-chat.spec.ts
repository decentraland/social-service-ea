import { ILoggerComponent } from '@well-known-components/interfaces'
import { rejectPrivateVoiceChatService } from '../../../../../src/adapters/rpc-server/services/reject-private-voice-chat'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { IVoiceComponent } from '../../../../../src/logic/voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { VoiceChatExpiredError, VoiceChatNotFoundError } from '../../../../../src/logic/voice/errors'
import { RejectPrivateVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'

describe('when rejecting a private voice chat', () => {
  let rejectPrivateVoiceChatMock: jest.MockedFn<IVoiceComponent['rejectPrivateVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let voice: jest.Mocked<IVoiceComponent>
  let callerAddress: string
  let calleeAddress: string
  let callId: string
  let service: ReturnType<typeof rejectPrivateVoiceChatService>

  beforeEach(async () => {
    callId = '1'
    rejectPrivateVoiceChatMock = jest.fn()
    callerAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    calleeAddress = '0xC001010101010101010101010101010101010101'
    logs = createLogsMockedComponent()
    voice = createVoiceMockedComponent({
      rejectPrivateVoiceChat: rejectPrivateVoiceChatMock
    })
    service = rejectPrivateVoiceChatService({
      components: { voice, logs }
    })
  })

  describe('and rejecting a private voice chat is successful', () => {
    beforeEach(() => {
      rejectPrivateVoiceChatMock.mockResolvedValue()
    })

    it('should resolve with an ok response and the call id', async () => {
      const result = await service(RejectPrivateVoiceChatPayload.create({ callId }), {
        address: calleeAddress,
        subscribersContext: undefined
      })

      expect(result).toEqual({
        response: {
          $case: 'ok',
          ok: {
            callId
          }
        }
      })
    })
  })

  describe('and rejecting a private voice chat fails with a voice chat not found error', () => {
    beforeEach(() => {
      rejectPrivateVoiceChatMock.mockRejectedValue(new VoiceChatNotFoundError(callId))
    })

    it('should resolve with a not found response', async () => {
      const result = await service(RejectPrivateVoiceChatPayload.create({ callId }), {
        address: calleeAddress,
        subscribersContext: undefined
      })

      expect(result.response?.$case).toBe('notFound')
      if (result.response?.$case === 'notFound') {
        expect(result.response.notFound.message).toBe(`The voice chat with id ${callId} was not found`)
      }
    })
  })

  describe('and rejecting a private voice chat fails with a voice chat expired error', () => {
    beforeEach(() => {
      rejectPrivateVoiceChatMock.mockRejectedValue(new VoiceChatExpiredError(callId))
    })

    it('should resolve with an invalid request response', async () => {
      const result = await service(RejectPrivateVoiceChatPayload.create({ callId }), {
        address: calleeAddress,
        subscribersContext: undefined
      })

      expect(result.response?.$case).toBe('invalidRequest')
      if (result.response?.$case === 'invalidRequest') {
        expect(result.response.invalidRequest.message).toBe(`The voice chat with id ${callId} has expired`)
      }
    })
  })

  describe('and rejecting a private voice chat fails with an unknown error', () => {
    beforeEach(() => {
      rejectPrivateVoiceChatMock.mockRejectedValue(new Error('Unknown error'))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(RejectPrivateVoiceChatPayload.create({ callId }), {
        address: calleeAddress,
        subscribersContext: undefined
      })

      expect(result.response?.$case).toBe('internalServerError')
      if (result.response?.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toBe('Unknown error')
      }
    })
  })
})

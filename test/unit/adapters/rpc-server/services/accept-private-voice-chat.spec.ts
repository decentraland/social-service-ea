import { ILoggerComponent } from '@well-known-components/interfaces'
import { IVoiceComponent } from '../../../../../src/logic/voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { VoiceChatExpiredError, VoiceChatNotAllowedError } from '../../../../../src/logic/voice/errors'
import { AcceptPrivateVoiceChatPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { acceptPrivateVoiceChatService } from '../../../../../src/adapters/rpc-server/services/accept-private-voice-chat'

describe('when accepting a private voice chat', () => {
  let acceptPrivateVoiceChatMock: jest.MockedFn<IVoiceComponent['acceptPrivateVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let voice: jest.Mocked<IVoiceComponent>
  let callerAddress: string
  let calleeAddress: string
  let callId: string
  let service: ReturnType<typeof acceptPrivateVoiceChatService>

  beforeEach(async () => {
    callId = '1'
    acceptPrivateVoiceChatMock = jest.fn()
    callerAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    calleeAddress = '0xC001010101010101010101010101010101010101'
    logs = createLogsMockedComponent()
    voice = createVoiceMockedComponent({
      acceptPrivateVoiceChat: acceptPrivateVoiceChatMock
    })
    service = acceptPrivateVoiceChatService({
      components: { voice, logs }
    })
  })

  describe('and accepting a private voice chat is successful', () => {
    let token: string
    let url: string

    beforeEach(() => {
      acceptPrivateVoiceChatMock.mockResolvedValue({
        token,
        url
      })
    })

    it('should resolve with an ok response, the call id and the credentials', async () => {
      const result = await service(
        AcceptPrivateVoiceChatPayload.create({
          callId
        }),
        {
          address: calleeAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok).toEqual({
          callId,
          credentials: {
            token,
            url
          }
        })
      }
    })
  })

  describe('and accepting a private voice chat fails with a voice chat not allowed error', () => {
    beforeEach(() => {
      acceptPrivateVoiceChatMock.mockRejectedValue(new VoiceChatNotAllowedError())
    })

    it('should resolve with a forbidden request response', async () => {
      const result = await service(
        AcceptPrivateVoiceChatPayload.create({
          callId
        }),
        {
          address: calleeAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          'The callee or the caller are not accepting voice calls from users that are not friends'
        )
      }
    })
  })

  describe('and accepting a private voice chat fails with voice chat not allowed error', () => {
    beforeEach(() => {
      acceptPrivateVoiceChatMock.mockRejectedValue(new VoiceChatNotAllowedError())
    })

    it('should resolve with an invalid request response', async () => {
      const result = await service(
        AcceptPrivateVoiceChatPayload.create({
          callId
        }),
        {
          address: calleeAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          'The callee or the caller are not accepting voice calls from users that are not friends'
        )
      }
    })
  })

  describe('and accepting a private voice chat fails with a voice chat expired error', () => {
    beforeEach(() => {
      acceptPrivateVoiceChatMock.mockRejectedValue(new VoiceChatExpiredError(calleeAddress))
    })

    it('should resolve with an invalid request response', async () => {
      const result = await service(
        AcceptPrivateVoiceChatPayload.create({
          callId
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('invalidRequest')
      if (result.response?.$case === 'invalidRequest') {
        expect(result.response.invalidRequest.message).toBe(`The voice chat with id ${calleeAddress} has expired`)
      }
    })
  })

  describe('and starting a private voice chat fails with an unknown error', () => {
    let errorMessage: string

    beforeEach(() => {
      errorMessage = 'Internal server error'
      acceptPrivateVoiceChatMock.mockRejectedValue(new Error(errorMessage))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        AcceptPrivateVoiceChatPayload.create({
          callId
        }),
        {
          address: calleeAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('internalServerError')
      if (result.response?.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toBe(errorMessage)
      }
    })
  })
})

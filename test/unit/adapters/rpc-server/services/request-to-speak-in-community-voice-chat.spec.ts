import { NotAuthorizedError } from '@dcl/http-commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  RequestToSpeakInCommunityVoiceChatPayload,
  RequestToSpeakInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { requestToSpeakInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/request-to-speak-in-community-voice-chat'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { createCommunityVoiceMockedComponent } from '../../../../mocks/components/community-voice'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { ICommunityVoiceComponent } from '../../../../../src/logic/community-voice'
import { RpcServerContext } from '../../../../../src/types'

describe('when requesting to speak in a community voice chat', () => {
  let requestToSpeakMock: jest.MockedFn<ICommunityVoiceComponent['requestToSpeakInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let communityVoice: jest.Mocked<ICommunityVoiceComponent>
  let communityId: string
  let userAddress: string
  let payload: RequestToSpeakInCommunityVoiceChatPayload
  let context: RpcServerContext
  let service: ReturnType<typeof requestToSpeakInCommunityVoiceChatService>
  let result: RequestToSpeakInCommunityVoiceChatResponse

  beforeEach(() => {
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    requestToSpeakMock = jest.fn().mockResolvedValue(undefined)
    logs = createLogsMockedComponent()
    communityVoice = createCommunityVoiceMockedComponent({
      requestToSpeakInCommunityVoiceChat: requestToSpeakMock
    })
    payload = RequestToSpeakInCommunityVoiceChatPayload.create({ communityId })
    context = { address: userAddress, subscribersContext: undefined }
    service = requestToSpeakInCommunityVoiceChatService({ components: { communityVoice, logs } })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the user raises their hand', () => {
    beforeEach(async () => {
      payload = RequestToSpeakInCommunityVoiceChatPayload.create({ communityId, isRaisingHand: true })
      result = await service(payload, context)
    })

    it('should resolve with an ok response', () => {
      expect(result.response?.$case).toBe('ok')
    })

    it('should forward the raised hand to the authorized voice chat logic', () => {
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, userAddress, true)
    })
  })

  describe('and the user lowers their hand', () => {
    beforeEach(async () => {
      payload = RequestToSpeakInCommunityVoiceChatPayload.create({ communityId, isRaisingHand: false })
      result = await service(payload, context)
    })

    it('should resolve with an ok response', () => {
      expect(result.response?.$case).toBe('ok')
    })

    it('should forward the lowered hand to the authorized voice chat logic', () => {
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, userAddress, false)
    })
  })

  describe('and the acting address is checksummed', () => {
    beforeEach(async () => {
      context = { address: '0xABCDEF123456789', subscribersContext: undefined }
      result = await service(payload, context)
    })

    it('should authorize the lowercased acting address', () => {
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, '0xabcdef123456789', false)
    })
  })

  describe('and the community id is missing', () => {
    beforeEach(async () => {
      payload = RequestToSpeakInCommunityVoiceChatPayload.create({ communityId: '' })
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not reach the voice chat logic', () => {
      expect(requestToSpeakMock).not.toHaveBeenCalled()
    })
  })

  describe('and the user is not a member of a private community', () => {
    beforeEach(async () => {
      requestToSpeakMock.mockRejectedValue(new UserNotCommunityMemberError(userAddress, communityId))
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })
  })

  describe('and the user is banned from the community', () => {
    beforeEach(async () => {
      requestToSpeakMock.mockRejectedValue(
        new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
      )
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })
  })

  describe('and there is no active voice chat for the community', () => {
    beforeEach(async () => {
      requestToSpeakMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      result = await service(payload, context)
    })

    it('should resolve with a not found error response', () => {
      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and requesting to speak fails with an unknown error', () => {
    beforeEach(async () => {
      requestToSpeakMock.mockRejectedValue(new Error('Unknown error'))
      result = await service(payload, context)
    })

    it('should resolve with an internal server error response', () => {
      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

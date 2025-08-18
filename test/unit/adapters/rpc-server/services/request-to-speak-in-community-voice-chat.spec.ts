import { ILoggerComponent } from '@well-known-components/interfaces'
import { RequestToSpeakInCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { requestToSpeakInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/request-to-speak-in-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'

describe('when requesting to speak in community voice chat', () => {
  let requestToSpeakMock: jest.MockedFn<ICommsGatekeeperComponent['requestToSpeakInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communityId: string
  let userAddress: string
  let service: ReturnType<typeof requestToSpeakInCommunityVoiceChatService>

  beforeEach(async () => {
    requestToSpeakMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      requestToSpeakInCommunityVoiceChat: requestToSpeakMock
    })
    service = requestToSpeakInCommunityVoiceChatService({
      components: { commsGatekeeper, logs }
    })
  })

  describe('and requesting to speak is successful', () => {
    beforeEach(() => {
      requestToSpeakMock.mockResolvedValue(undefined)
    })

    it('should resolve with an ok response for raising hand (default)', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, userAddress, false) // default value
    })

    it('should resolve with an ok response for explicitly raising hand', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId,
          isRaisingHand: true
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, userAddress, true)
    })

    it('should resolve with an ok response for lowering hand', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId,
          isRaisingHand: false
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(requestToSpeakMock).toHaveBeenCalledWith(communityId, userAddress, false)
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId: ''
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('invalidRequest')
    })
  })

  describe('and requesting to speak fails with a user not member error', () => {
    beforeEach(() => {
      requestToSpeakMock.mockRejectedValue(new UserNotCommunityMemberError(userAddress, communityId))
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
    })
  })

  describe('and requesting to speak fails with a voice chat not found error', () => {
    beforeEach(() => {
      requestToSpeakMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and requesting to speak fails with an unknown error', () => {
    beforeEach(() => {
      requestToSpeakMock.mockRejectedValue(new Error('Unknown error'))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        RequestToSpeakInCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

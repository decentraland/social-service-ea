import { ILoggerComponent } from '@well-known-components/interfaces'
import { DemoteSpeakerInCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { demoteSpeakerInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/demote-speaker-in-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'

function createCommsGatekeeperMockedComponent({
  demoteSpeakerInCommunityVoiceChat = jest.fn()
}: Partial<jest.Mocked<ICommsGatekeeperComponent>>): jest.Mocked<ICommsGatekeeperComponent> {
  return {
    requestToSpeakInCommunityVoiceChat: jest.fn(),
    createCommunityVoiceChatRoom: jest.fn(),
    getCommunityVoiceChatCredentials: jest.fn(),
    getCommunityVoiceChatStatus: jest.fn(),
    isUserInAVoiceChat: jest.fn(),
    getPrivateVoiceChatCredentials: jest.fn(),
    endPrivateVoiceChat: jest.fn(),
    updateUserPrivateMessagePrivacyMetadata: jest.fn(),
    updateUserMetadataInCommunityVoiceChat: jest.fn(),
    promoteSpeakerInCommunityVoiceChat: jest.fn(),
    demoteSpeakerInCommunityVoiceChat,
    kickUserFromCommunityVoiceChat: jest.fn()
  }
}

describe('when demoting speaker in community voice chat', () => {
  let demoteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['demoteSpeakerInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communityId: string
  let userAddress: string
  let targetUserAddress: string
  let service: ReturnType<typeof demoteSpeakerInCommunityVoiceChatService>

  beforeEach(async () => {
    demoteSpeakerMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      demoteSpeakerInCommunityVoiceChat: demoteSpeakerMock
    })
    service = demoteSpeakerInCommunityVoiceChatService({
      components: { commsGatekeeper, logs }
    })
  })

  describe('and demoting speaker is successful', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
    })

    it('should resolve with an ok response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId: '',
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('invalidRequest')
    })
  })

  describe('and user address is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: ''
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('invalidRequest')
    })
  })

  describe('and demoting speaker fails with a user not member error', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockRejectedValue(new UserNotCommunityMemberError(targetUserAddress, communityId))
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
    })
  })

  describe('and demoting speaker fails with a voice chat not found error', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and demoting speaker fails with an unknown error', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockRejectedValue(new Error('Unknown error'))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
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

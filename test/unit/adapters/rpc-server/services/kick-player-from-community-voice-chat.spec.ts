import { ILoggerComponent } from '@well-known-components/interfaces'
import { KickPlayerFromCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { kickPlayerFromCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/kick-player-from-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'

function createCommsGatekeeperMockedComponent({
  kickUserFromCommunityVoiceChat = jest.fn()
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
    demoteSpeakerInCommunityVoiceChat: jest.fn(),
    kickUserFromCommunityVoiceChat
  }
}

describe('when kicking player from community voice chat', () => {
  let kickPlayerMock: jest.MockedFn<ICommsGatekeeperComponent['kickUserFromCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communityId: string
  let userAddress: string
  let targetUserAddress: string
  let service: ReturnType<typeof kickPlayerFromCommunityVoiceChatService>

  beforeEach(async () => {
    kickPlayerMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      kickUserFromCommunityVoiceChat: kickPlayerMock
    })
    service = kickPlayerFromCommunityVoiceChatService({
      components: { commsGatekeeper, logs }
    })
  })

  describe('and kicking player is successful', () => {
    beforeEach(() => {
      kickPlayerMock.mockResolvedValue(undefined)
    })

    it('should resolve with an ok response', async () => {
      const result = await service(
        KickPlayerFromCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(kickPlayerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        KickPlayerFromCommunityVoiceChatPayload.create({
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
        KickPlayerFromCommunityVoiceChatPayload.create({
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

  describe('and kicking player fails with a user not member error', () => {
    beforeEach(() => {
      kickPlayerMock.mockRejectedValue(new UserNotCommunityMemberError(targetUserAddress, communityId))
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        KickPlayerFromCommunityVoiceChatPayload.create({
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

  describe('and kicking player fails with a voice chat not found error', () => {
    beforeEach(() => {
      kickPlayerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        KickPlayerFromCommunityVoiceChatPayload.create({
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

  describe('and kicking player fails with an unknown error', () => {
    beforeEach(() => {
      kickPlayerMock.mockRejectedValue(new Error('Unknown error'))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        KickPlayerFromCommunityVoiceChatPayload.create({
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
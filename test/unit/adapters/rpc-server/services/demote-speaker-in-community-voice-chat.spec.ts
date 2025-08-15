import { ILoggerComponent } from '@well-known-components/interfaces'
import { DemoteSpeakerInCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { demoteSpeakerInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/demote-speaker-in-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { mockCommunitiesDB } from '../../../../mocks/components/communities-db'
import { CommunityRole } from '../../../../../src/types/entities'

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
      components: { commsGatekeeper, logs, communitiesDb: mockCommunitiesDB }
    })
  })

  describe('when user is demoting themselves (self-demote)', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
    })

    it('should allow regular member to demote themselves', async () => {
      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: userAddress // Same as context.address = self-demote
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('You have been demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
    })

    it('should allow moderator to demote themselves', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)

      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: userAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('You have been demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress)
    })

    it('should allow owner to demote themselves', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)

      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: userAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('You have been demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress)
    })

    it('should reject self-demote if user is not a community member', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)

      const result = await service(
        DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: userAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('when moderator is demoting another user', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should allow moderator to demote other members', async () => {
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
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('User demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress) // acting user
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, targetUserAddress) // target user
    })
  })

  describe('when owner is demoting another user', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Owner) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should allow owner to demote other members', async () => {
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
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('User demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
    })
  })

  describe('when regular member tries to demote another user', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
    })

    it('should reject with permission error', async () => {
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
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          'Only community owners and moderators can demote other speakers'
        )
      }
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('when acting user is not a community member', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
    })

    it('should reject with not member error', async () => {
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
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('when target user is not a community member', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.None) // target user role
    })

    it('should reject with target not member error', async () => {
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
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and demoting speaker is successful (legacy test)', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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
      // Setup permission validation to pass by making the acting user a moderator
      // and the target user a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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
      // Setup permission validation to pass by making the acting user a moderator
      // and the target user a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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

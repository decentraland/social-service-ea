import { ILoggerComponent } from '@well-known-components/interfaces'
import { PromoteSpeakerInCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { promoteSpeakerInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/promote-speaker-in-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'
import { CommunityPrivacyEnum } from '../../../../../src/logic/community/types'

describe('when promoting speaker in community voice chat', () => {
  let promoteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['promoteSpeakerInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDB: {
    getCommunityMemberRole: jest.MockedFunction<any>
    getCommunity: jest.MockedFunction<any>
    isMemberBanned: jest.MockedFunction<any>
  }
  let communityId: string
  let userAddress: string
  let targetUserAddress: string
  let service: ReturnType<typeof promoteSpeakerInCommunityVoiceChatService>

  beforeEach(async () => {
    promoteSpeakerMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      promoteSpeakerInCommunityVoiceChat: promoteSpeakerMock
    })

    mockCommunitiesDB = {
      getCommunityMemberRole: jest.fn(),
      getCommunity: jest.fn(),
      isMemberBanned: jest.fn()
    }

    // Setup default mocks
    mockCommunitiesDB.getCommunity.mockResolvedValue({
      id: communityId,
      privacy: CommunityPrivacyEnum.Public // Default to public community
    })
    mockCommunitiesDB.isMemberBanned.mockResolvedValue(false) // Default to not banned

    service = promoteSpeakerInCommunityVoiceChatService({
      components: {
        commsGatekeeper,
        logs,
        communitiesDb: mockCommunitiesDB as any
      }
    })
  })

  describe('and promoting speaker is successful in public community', () => {
    beforeEach(() => {
      promoteSpeakerMock.mockResolvedValue(undefined)
      // Setup permission validation to pass for public community (default setup)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
    })

    it('should resolve with an ok response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      // For public communities, only acting user role is checked
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
    })
  })

  describe('and user is not a moderator or owner', () => {
    beforeEach(() => {
      // Acting user is just a member (no permission to promote)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Member)
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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
        expect(result.response.forbiddenError?.message).toContain(
          'Only community owners and moderators can promote speakers'
        )
      }
      expect(promoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('when community is public', () => {
    beforeEach(() => {
      // Setup public community - already set in global beforeEach
      mockCommunitiesDB.getCommunity.mockResolvedValue({
        id: communityId,
        privacy: CommunityPrivacyEnum.Public
      })
    })

    describe('and acting user is a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        promoteSpeakerMock.mockResolvedValue(undefined)
      })

      it('should allow promoting any user (no membership restrictions for public communities)', async () => {
        const result = await service(
          PromoteSpeakerInCommunityVoiceChatPayload.create({
            communityId,
            userAddress: targetUserAddress
          }),
          {
            address: userAddress,
            subscribersContext: undefined
          }
        )

        expect(result.response?.$case).toBe('ok')
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
        // Should not check target user membership or ban status for public communities
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
        expect(mockCommunitiesDB.isMemberBanned).not.toHaveBeenCalled()
      })
    })
  })

  describe('when community is private', () => {
    beforeEach(() => {
      // Setup private community
      mockCommunitiesDB.getCommunity.mockResolvedValue({
        id: communityId,
        privacy: CommunityPrivacyEnum.Private
      })
    })

    describe('and target user is a member and not banned', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole
          .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
          .mockResolvedValueOnce(CommunityRole.Member) // target user is member
        mockCommunitiesDB.isMemberBanned.mockResolvedValue(false) // not banned
        promoteSpeakerMock.mockResolvedValue(undefined)
      })

      it('should allow promoting member users who are not banned', async () => {
        const result = await service(
          PromoteSpeakerInCommunityVoiceChatPayload.create({
            communityId,
            userAddress: targetUserAddress
          }),
          {
            address: userAddress,
            subscribersContext: undefined
          }
        )

        expect(result.response?.$case).toBe('ok')
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
        expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })

    describe('and target user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole
          .mockResolvedValueOnce(CommunityRole.Owner) // acting user role
          .mockResolvedValueOnce(CommunityRole.None) // target user is not a member
      })

      it('should resolve with a forbidden error response', async () => {
        const result = await service(
          PromoteSpeakerInCommunityVoiceChatPayload.create({
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
          expect(result.response.forbiddenError?.message).toContain('not a member of community')
        }
        expect(promoteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and target user is a member but is banned', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole
          .mockResolvedValueOnce(CommunityRole.Owner) // acting user role
          .mockResolvedValueOnce(CommunityRole.Member) // target user is member
        mockCommunitiesDB.isMemberBanned.mockResolvedValue(true) // but is banned
      })

      it('should resolve with a forbidden error response (banned users cannot be promoted)', async () => {
        const result = await service(
          PromoteSpeakerInCommunityVoiceChatPayload.create({
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
          expect(result.response.forbiddenError?.message).toContain('not a member of community')
        }
        expect(promoteSpeakerMock).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })
  })

  describe('and acting user is not a community member', () => {
    beforeEach(() => {
      // Acting user is not a member (should fail permission check)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.None)
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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
        expect(result.response.forbiddenError?.message).toContain(
          'Only community owners and moderators can promote speakers'
        )
      }
      expect(promoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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

  describe('and promoting speaker fails with a user not member error', () => {
    beforeEach(() => {
      promoteSpeakerMock.mockRejectedValue(new UserNotCommunityMemberError(targetUserAddress, communityId))
      // Setup permission validation to pass by making the acting user a moderator
      // and the target user a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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

  describe('and promoting speaker fails with a voice chat not found error', () => {
    beforeEach(() => {
      promoteSpeakerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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

  describe('and promoting speaker fails with an unknown error', () => {
    beforeEach(() => {
      promoteSpeakerMock.mockRejectedValue(new Error('Unknown error'))
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        PromoteSpeakerInCommunityVoiceChatPayload.create({
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

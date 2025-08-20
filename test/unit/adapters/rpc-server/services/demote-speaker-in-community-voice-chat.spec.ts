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
import { CommunityRole } from '../../../../../src/types/entities'

describe('when demoting speaker in community voice chat', () => {
  let demoteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['demoteSpeakerInCommunityVoiceChat']>
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

    mockCommunitiesDB = {
      getCommunityMemberRole: jest.fn(),
      getCommunity: jest.fn(),
      isMemberBanned: jest.fn()
    }

    // Setup default mocks
    mockCommunitiesDB.getCommunity.mockResolvedValue({
      id: communityId,
      privacy: 'public' // Default to public community
    })
    mockCommunitiesDB.isMemberBanned.mockResolvedValue(false) // Default to not banned

    // Reset mocks
    jest.clearAllMocks()

    service = demoteSpeakerInCommunityVoiceChatService({
      components: { commsGatekeeper, logs, communitiesDb: mockCommunitiesDB as any }
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

    it('should allow self-demote even if user is not a community member (public community)', async () => {
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

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.message).toBe('You have been demoted to listener successfully')
      }
      expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress)
    })
  })

  describe('when moderator is demoting another user in public community', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
    })

    it('should allow moderator to demote other members (no membership restrictions for public communities)', async () => {
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
      // For public communities, only acting user role is checked
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress) // acting user
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

  describe('when target user is not a community member in public community', () => {
    beforeEach(() => {
      demoteSpeakerMock.mockResolvedValue(undefined)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
    })

    it('should allow demoting non-member user (public community)', async () => {
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
      // For public communities, only acting user role is checked
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
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

  describe('validation for community privacy and banned users', () => {
    describe('when community is public', () => {
      beforeEach(() => {
        // Setup public community
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          privacy: 'public'
        })
      })

      describe('and acting user is a moderator demoting another user', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
          demoteSpeakerMock.mockResolvedValue(undefined)
        })

        it('should allow demoting any user (no membership restrictions for public communities)', async () => {
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
          privacy: 'private'
        })
      })

      describe('and target user is a member and not banned', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRole
            .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
            .mockResolvedValueOnce(CommunityRole.Member) // target user is member
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(false) // not banned
          demoteSpeakerMock.mockResolvedValue(undefined)
        })

        it('should allow demoting member users who are not banned', async () => {
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
            expect(result.response.forbiddenError?.message).toContain('not a member of community')
          }
          expect(demoteSpeakerMock).not.toHaveBeenCalled()
        })
      })

      describe('and target user is a member but is banned', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRole
            .mockResolvedValueOnce(CommunityRole.Owner) // acting user role
            .mockResolvedValueOnce(CommunityRole.Member) // target user is member
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true) // but is banned
        })

        it('should resolve with a forbidden error response (banned users cannot be demoted)', async () => {
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
            expect(result.response.forbiddenError?.message).toContain('not a member of community')
          }
          expect(demoteSpeakerMock).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.isMemberBanned).toHaveBeenCalledWith(communityId, targetUserAddress)
        })
      })
    })
  })
})

import { ILoggerComponent } from '@well-known-components/interfaces'
import { KickPlayerFromCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { kickPlayerFromCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/kick-player-from-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'

describe('when kicking player from community voice chat', () => {
  let kickPlayerMock: jest.MockedFn<ICommsGatekeeperComponent['kickUserFromCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
    let mockCommunitiesDB: {
    getCommunityMemberRole: jest.MockedFunction<any>
  }
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

    mockCommunitiesDB = {
      getCommunityMemberRole: jest.fn()
    }

    service = kickPlayerFromCommunityVoiceChatService({
      components: {
        commsGatekeeper,
        logs,
        communitiesDb: mockCommunitiesDB as any
      }
    })
  })

  describe('and kicking player is successful', () => {
    beforeEach(() => {
      kickPlayerMock.mockResolvedValue(undefined)
      // Setup permission validation to pass - for public community (default), only acting user role is checked
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
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
      // For public communities, only acting user role is checked (no target user validation)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
    })
  })

  describe('and user is not a moderator or owner', () => {
    beforeEach(() => {
      // Acting user is just a member (no permission to kick)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Member)
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
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError?.message).toContain(
          'Only community owners and moderators can kick players'
        )
      }
      expect(kickPlayerMock).not.toHaveBeenCalled()
    })
  })

  describe('and moderator/owner kicking any user', () => {
    beforeEach(() => {
      // Setup acting user as moderator
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
      kickPlayerMock.mockResolvedValue(undefined)
    })

    it('should allow kicking any user (no restrictions on target user)', async () => {
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
      // Should only check acting user role, no restrictions on target user
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(1)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
      // Should not check community privacy, target membership, or ban status
    })
  })

  describe('and acting user is not a community member', () => {
    beforeEach(() => {
      // Acting user is not a member (should fail permission check)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.None)
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
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError?.message).toContain(
          'Only community owners and moderators can kick players'
        )
      }
      expect(kickPlayerMock).not.toHaveBeenCalled()
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
      // Setup permission validation to pass by making the acting user a moderator
      // and the target user a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
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

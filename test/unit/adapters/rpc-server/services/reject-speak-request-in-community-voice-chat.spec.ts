import { ILoggerComponent } from '@well-known-components/interfaces'
import { RejectSpeakRequestInCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { rejectSpeakRequestInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/reject-speak-request-in-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'

describe('when rejecting speak request in community voice chat', () => {
  let rejectSpeakRequestMock: jest.MockedFn<ICommsGatekeeperComponent['rejectSpeakRequestInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDB: { getCommunityMemberRole: jest.MockedFunction<any> }
  let communityId: string
  let userAddress: string
  let targetUserAddress: string
  let service: ReturnType<typeof rejectSpeakRequestInCommunityVoiceChatService>

  beforeEach(async () => {
    rejectSpeakRequestMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      rejectSpeakRequestInCommunityVoiceChat: rejectSpeakRequestMock
    })

    mockCommunitiesDB = {
      getCommunityMemberRole: jest.fn()
    }

    service = rejectSpeakRequestInCommunityVoiceChatService({
      components: {
        commsGatekeeper,
        logs,
        communitiesDb: mockCommunitiesDB as any
      }
    })
  })

  describe('and rejecting speak request is successful', () => {
    beforeEach(() => {
      rejectSpeakRequestMock.mockResolvedValue(undefined)
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with an ok response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: targetUserAddress
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      expect(rejectSpeakRequestMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledTimes(2)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenNthCalledWith(1, communityId, userAddress)
      expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenNthCalledWith(2, communityId, targetUserAddress)
    })
  })

  describe('and user is not a moderator or owner', () => {
    beforeEach(() => {
      // Acting user is just a member (no permission to reject requests)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Member)
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
          'Only community owners and moderators can reject speak requests'
        )
      }
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
    })
  })

  describe('and target user is not a community member', () => {
    beforeEach(() => {
      // Acting user has permissions but target user is not a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Owner) // acting user role
        .mockResolvedValueOnce(CommunityRole.None) // target user is not a member
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
    })
  })

  describe('and acting user is not a community member', () => {
    beforeEach(() => {
      // Acting user is not a member (should fail permission check)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.None)
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
          'Only community owners and moderators can reject speak requests'
        )
      }
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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

  describe('and rejecting speak request fails with a user not member error', () => {
    beforeEach(() => {
      rejectSpeakRequestMock.mockRejectedValue(new UserNotCommunityMemberError(targetUserAddress, communityId))
      // Setup permission validation to pass by making the acting user a moderator
      // and the target user a member
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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

  describe('and rejecting speak request fails with a voice chat not found error', () => {
    beforeEach(() => {
      rejectSpeakRequestMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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

  describe('and rejecting speak request fails with an unknown error', () => {
    beforeEach(() => {
      rejectSpeakRequestMock.mockRejectedValue(new Error('Unknown error'))
      // Setup permission validation to pass
      mockCommunitiesDB.getCommunityMemberRole
        .mockResolvedValueOnce(CommunityRole.Moderator) // acting user role
        .mockResolvedValueOnce(CommunityRole.Member) // target user role
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        RejectSpeakRequestInCommunityVoiceChatPayload.create({
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

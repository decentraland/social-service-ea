import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  PromoteSpeakerInCommunityVoiceChatPayload,
  PromoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { promoteSpeakerInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/promote-speaker-in-community-voice-chat'
import { ICommsGatekeeperComponent, ICommunitiesDatabaseComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { CommunityVoiceChatNotFoundError } from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '../../../../../src/logic/community/types'
import { RpcServerContext } from '../../../../../src/types'

describe('when promoting a speaker in a community voice chat', () => {
  let promoteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['promoteSpeakerInCommunityVoiceChat']>
  let getCommunityMemberRolesMock: jest.MockedFn<ICommunitiesDatabaseComponent['getCommunityMemberRoles']>
  let getCommunityMock: jest.MockedFn<ICommunitiesDatabaseComponent['getCommunity']>
  let isMemberBannedMock: jest.MockedFn<ICommunitiesDatabaseComponent['isMemberBanned']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communitiesDb: Pick<
    ICommunitiesDatabaseComponent,
    'getCommunityMemberRoles' | 'getCommunityMemberRole' | 'getCommunity' | 'isMemberBanned'
  >
  let communityId: string
  let actingUserAddress: string
  let targetUserAddress: string
  let payload: PromoteSpeakerInCommunityVoiceChatPayload
  let context: RpcServerContext
  let service: ReturnType<typeof promoteSpeakerInCommunityVoiceChatService>
  let result: PromoteSpeakerInCommunityVoiceChatResponse

  beforeEach(() => {
    communityId = 'test-community-id'
    actingUserAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    promoteSpeakerMock = jest.fn().mockResolvedValue(undefined)
    getCommunityMemberRolesMock = jest.fn()
    getCommunityMock = jest.fn().mockResolvedValue({
      id: communityId,
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0xowner',
      privacy: CommunityPrivacyEnum.Public,
      visibility: CommunityVisibilityEnum.All,
      active: true,
      role: CommunityRole.Moderator
    })
    isMemberBannedMock = jest.fn().mockResolvedValue(false)
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      promoteSpeakerInCommunityVoiceChat: promoteSpeakerMock
    })
    communitiesDb = {
      getCommunityMemberRoles: getCommunityMemberRolesMock,
      getCommunityMemberRole: jest.fn(),
      getCommunity: getCommunityMock,
      isMemberBanned: isMemberBannedMock
    }
    payload = PromoteSpeakerInCommunityVoiceChatPayload.create({
      communityId,
      userAddress: targetUserAddress
    })
    context = { address: actingUserAddress, subscribersContext: undefined }
    service = promoteSpeakerInCommunityVoiceChatService({
      components: { commsGatekeeper, logs, communitiesDb: communitiesDb as ICommunitiesDatabaseComponent }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the community is public', () => {
    describe('and a moderator promotes a plain member', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should promote the target user to speaker', () => {
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should resolve both roles with a single batched query', () => {
        expect(getCommunityMemberRolesMock).toHaveBeenCalledTimes(1)
        expect(getCommunityMemberRolesMock).toHaveBeenCalledWith(communityId, [actingUserAddress, targetUserAddress])
      })

      it('should not check the ban list for a public community', () => {
        expect(isMemberBannedMock).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator promotes a guest holding no role', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should promote the guest to speaker', () => {
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })

    describe('and a moderator promotes the community owner', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Owner
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not promote the owner', () => {
        expect(promoteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the owner promotes a moderator', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Owner,
          [targetUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should promote the moderator to speaker', () => {
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })
  })

  describe('and the community is private', () => {
    beforeEach(() => {
      getCommunityMock.mockResolvedValue({
        id: communityId,
        name: 'Private Test Community',
        description: 'Test Description',
        ownerAddress: '0xowner',
        privacy: CommunityPrivacyEnum.Private,
        visibility: CommunityVisibilityEnum.All,
        active: true,
        role: CommunityRole.Moderator
      })
    })

    describe('and the target user is a member who is not banned', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should promote the target user to speaker', () => {
        expect(promoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should reuse the batched target role instead of querying it again', () => {
        expect(communitiesDb.getCommunityMemberRole).not.toHaveBeenCalled()
      })

      it('should check the target user ban status', () => {
        expect(isMemberBannedMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })

    describe('and the target user is not a member', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not promote the non-member', () => {
        expect(promoteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the target user is a banned member', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        isMemberBannedMock.mockResolvedValue(true)
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not promote the banned member', () => {
        expect(promoteSpeakerMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the acting user is a plain member', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Member,
        [targetUserAddress]: CommunityRole.Member
      })
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })

    it('should not promote the target user', () => {
      expect(promoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the acting user is not a community member', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({})
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })

    it('should not promote the target user', () => {
      expect(promoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community does not exist', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      getCommunityMock.mockResolvedValue(null as never)
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not promote the target user', () => {
      expect(promoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community id is missing', () => {
    beforeEach(async () => {
      payload = PromoteSpeakerInCommunityVoiceChatPayload.create({
        communityId: '',
        userAddress: targetUserAddress
      })
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not look up any community roles', () => {
      expect(getCommunityMemberRolesMock).not.toHaveBeenCalled()
    })
  })

  describe('and the target user address is missing', () => {
    beforeEach(async () => {
      payload = PromoteSpeakerInCommunityVoiceChatPayload.create({
        communityId,
        userAddress: ''
      })
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not look up any community roles', () => {
      expect(getCommunityMemberRolesMock).not.toHaveBeenCalled()
    })
  })

  describe('and the gatekeeper reports the voice chat is not found', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      promoteSpeakerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      result = await service(payload, context)
    })

    it('should resolve with a not found error response', () => {
      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and promoting the speaker fails with an unknown error', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      promoteSpeakerMock.mockRejectedValue(new Error('Unknown error'))
      result = await service(payload, context)
    })

    it('should resolve with an internal server error response', () => {
      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

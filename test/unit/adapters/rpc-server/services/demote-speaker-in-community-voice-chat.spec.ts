import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  DemoteSpeakerInCommunityVoiceChatPayload,
  DemoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { demoteSpeakerInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/demote-speaker-in-community-voice-chat'
import { ICommsGatekeeperComponent, ICommunitiesDatabaseComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { CommunityVoiceChatNotFoundError } from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '../../../../../src/logic/community/types'
import { RpcServerContext } from '../../../../../src/types'

describe('when demoting a speaker in a community voice chat', () => {
  let demoteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['demoteSpeakerInCommunityVoiceChat']>
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
  let payload: DemoteSpeakerInCommunityVoiceChatPayload
  let context: RpcServerContext
  let service: ReturnType<typeof demoteSpeakerInCommunityVoiceChatService>
  let result: DemoteSpeakerInCommunityVoiceChatResponse

  beforeEach(() => {
    communityId = 'test-community-id'
    actingUserAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    demoteSpeakerMock = jest.fn().mockResolvedValue(undefined)
    getCommunityMemberRolesMock = jest.fn()
    getCommunityMock = jest.fn()
    isMemberBannedMock = jest.fn().mockResolvedValue(false)
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      demoteSpeakerInCommunityVoiceChat: demoteSpeakerMock
    })
    communitiesDb = {
      getCommunityMemberRoles: getCommunityMemberRolesMock,
      getCommunityMemberRole: jest.fn(),
      getCommunity: getCommunityMock,
      isMemberBanned: isMemberBannedMock
    }
    payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
      communityId,
      userAddress: targetUserAddress
    })
    context = { address: actingUserAddress, subscribersContext: undefined }
    service = demoteSpeakerInCommunityVoiceChatService({
      components: { commsGatekeeper, logs, communitiesDb: communitiesDb as ICommunitiesDatabaseComponent }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the community is public', () => {
    describe('and a moderator demotes a plain member', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Moderator
        })
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the target user to listener', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should resolve both roles with a single batched query', () => {
        expect(getCommunityMemberRolesMock).toHaveBeenCalledTimes(1)
        expect(getCommunityMemberRolesMock).toHaveBeenCalledWith(communityId, [actingUserAddress, targetUserAddress])
      })
    })

    describe('and a moderator demotes the community owner', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: targetUserAddress,
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Moderator
        })
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Owner
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not demote the owner', () => {
        expect(demoteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator demotes another moderator', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Moderator
        })
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response, since revoking a mic is reversible', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the other moderator', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })

    describe('and the owner demotes a moderator', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: actingUserAddress,
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Owner
        })
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Owner,
          [targetUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the moderator to listener', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })

    describe('and a guest holding no role demotes themselves', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.None
        })
        payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: actingUserAddress
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the guest to listener', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, actingUserAddress)
      })

      it('should not run the moderation hierarchy check', () => {
        expect(getCommunityMemberRolesMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the community is private', () => {
    describe('and a member demotes themselves', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Private Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Private,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Member
        })
        payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: actingUserAddress
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the member to listener', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, actingUserAddress)
      })
    })

    describe('and a non-member demotes themselves', () => {
      beforeEach(async () => {
        getCommunityMock.mockResolvedValue({
          id: communityId,
          name: 'Private Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Private,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.None
        })
        payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
          communityId,
          userAddress: actingUserAddress
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not demote the non-member', () => {
        expect(demoteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator demotes a member who is not banned', () => {
      beforeEach(async () => {
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
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should demote the member to listener', () => {
        expect(demoteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should reuse the batched target role instead of querying it again', () => {
        expect(communitiesDb.getCommunityMemberRole).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator demotes a user who is not a member', () => {
      beforeEach(async () => {
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
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not demote the non-member', () => {
        expect(demoteSpeakerMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the acting user is a plain member demoting someone else', () => {
    beforeEach(async () => {
      getCommunityMock.mockResolvedValue({
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0xowner',
        privacy: CommunityPrivacyEnum.Public,
        visibility: CommunityVisibilityEnum.All,
        active: true,
        role: CommunityRole.Member
      })
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Member,
        [targetUserAddress]: CommunityRole.Member
      })
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })

    it('should not demote the target user', () => {
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community does not exist', () => {
    beforeEach(async () => {
      getCommunityMock.mockResolvedValue(null as never)
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not demote the target user', () => {
      expect(demoteSpeakerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community id is missing', () => {
    beforeEach(async () => {
      payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
        communityId: '',
        userAddress: targetUserAddress
      })
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not look up the community', () => {
      expect(getCommunityMock).not.toHaveBeenCalled()
    })
  })

  describe('and the target user address is missing', () => {
    beforeEach(async () => {
      payload = DemoteSpeakerInCommunityVoiceChatPayload.create({
        communityId,
        userAddress: ''
      })
      result = await service(payload, context)
    })

    it('should resolve with an invalid request response', () => {
      expect(result.response?.$case).toBe('invalidRequest')
    })

    it('should not look up the community', () => {
      expect(getCommunityMock).not.toHaveBeenCalled()
    })
  })

  describe('and the gatekeeper reports the voice chat is not found', () => {
    beforeEach(async () => {
      getCommunityMock.mockResolvedValue({
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: actingUserAddress,
        privacy: CommunityPrivacyEnum.Public,
        visibility: CommunityVisibilityEnum.All,
        active: true,
        role: CommunityRole.Owner
      })
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      demoteSpeakerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      result = await service(payload, context)
    })

    it('should resolve with a not found error response', () => {
      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and demoting the speaker fails with an unknown error', () => {
    beforeEach(async () => {
      getCommunityMock.mockResolvedValue({
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: actingUserAddress,
        privacy: CommunityPrivacyEnum.Public,
        visibility: CommunityVisibilityEnum.All,
        active: true,
        role: CommunityRole.Owner
      })
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      demoteSpeakerMock.mockRejectedValue(new Error('Unknown error'))
      result = await service(payload, context)
    })

    it('should resolve with an internal server error response', () => {
      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

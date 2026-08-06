import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  RejectSpeakRequestInCommunityVoiceChatPayload,
  RejectSpeakRequestInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { rejectSpeakRequestInCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/reject-speak-request-in-community-voice-chat'
import { ICommsGatekeeperComponent, ICommunitiesDatabaseComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { CommunityVoiceChatNotFoundError } from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'
import { RpcServerContext } from '../../../../../src/types'

describe('when rejecting a speak request in a community voice chat', () => {
  let rejectSpeakRequestMock: jest.MockedFn<ICommsGatekeeperComponent['rejectSpeakRequestInCommunityVoiceChat']>
  let getCommunityMemberRolesMock: jest.MockedFn<ICommunitiesDatabaseComponent['getCommunityMemberRoles']>
  let getBannedMemberAddressesMock: jest.MockedFn<ICommunitiesDatabaseComponent['getBannedMemberAddresses']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communitiesDb: Pick<ICommunitiesDatabaseComponent, 'getCommunityMemberRoles' | 'getBannedMemberAddresses'>
  let communityId: string
  let actingUserAddress: string
  let targetUserAddress: string
  let payload: RejectSpeakRequestInCommunityVoiceChatPayload
  let context: RpcServerContext
  let service: ReturnType<typeof rejectSpeakRequestInCommunityVoiceChatService>
  let result: RejectSpeakRequestInCommunityVoiceChatResponse

  beforeEach(() => {
    communityId = 'test-community-id'
    actingUserAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    rejectSpeakRequestMock = jest.fn().mockResolvedValue(undefined)
    getCommunityMemberRolesMock = jest.fn()
    getBannedMemberAddressesMock = jest.fn().mockResolvedValue([])
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      rejectSpeakRequestInCommunityVoiceChat: rejectSpeakRequestMock
    })
    communitiesDb = {
      getCommunityMemberRoles: getCommunityMemberRolesMock,
      getBannedMemberAddresses: getBannedMemberAddressesMock
    }
    payload = RejectSpeakRequestInCommunityVoiceChatPayload.create({
      communityId,
      userAddress: targetUserAddress
    })
    context = { address: actingUserAddress, subscribersContext: undefined }
    service = rejectSpeakRequestInCommunityVoiceChatService({
      components: { commsGatekeeper, logs, communitiesDb: communitiesDb as ICommunitiesDatabaseComponent }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the acting user is a moderator', () => {
    describe('and the target user is a plain member', () => {
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

      it('should reject the speak request in the voice chat room', () => {
        expect(rejectSpeakRequestMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should resolve both roles with a single batched query', () => {
        expect(getCommunityMemberRolesMock).toHaveBeenCalledTimes(1)
        expect(getCommunityMemberRolesMock).toHaveBeenCalledWith(communityId, [actingUserAddress, targetUserAddress])
      })

      it('should resolve both ban statuses with a single batched query', () => {
        expect(getBannedMemberAddressesMock).toHaveBeenCalledTimes(1)
        expect(getBannedMemberAddressesMock).toHaveBeenCalledWith(communityId, [actingUserAddress, targetUserAddress])
      })
    })

    describe('and the target user is the community owner', () => {
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

      it('should not reject the owner speak request', () => {
        expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
      })
    })

    describe('and the target user is not a community member', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with a forbidden error response', () => {
        expect(result.response?.$case).toBe('forbiddenError')
      })

      it('should not reject the speak request', () => {
        expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the acting user is the community owner', () => {
    describe('and the target user is a moderator', () => {
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

      it('should reject the moderator speak request', () => {
        expect(rejectSpeakRequestMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })
    })
  })

  describe('and the acting user is a banned moderator', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Moderator,
        [targetUserAddress]: CommunityRole.Member
      })
      getBannedMemberAddressesMock.mockResolvedValue([actingUserAddress])
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })

    it('should not reject the speak request', () => {
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
    })
  })

  describe('and the acting user is a banned owner', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      getBannedMemberAddressesMock.mockResolvedValue([actingUserAddress])
      result = await service(payload, context)
    })

    it('should resolve with a forbidden error response', () => {
      expect(result.response?.$case).toBe('forbiddenError')
    })

    it('should not reject the speak request', () => {
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
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

    it('should not reject the speak request', () => {
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
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

    it('should not reject the speak request', () => {
      expect(rejectSpeakRequestMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community id is missing', () => {
    beforeEach(async () => {
      payload = RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
      payload = RejectSpeakRequestInCommunityVoiceChatPayload.create({
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
      rejectSpeakRequestMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      result = await service(payload, context)
    })

    it('should resolve with a not found error response', () => {
      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and rejecting the speak request fails with an unknown error', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      rejectSpeakRequestMock.mockRejectedValue(new Error('Unknown error'))
      result = await service(payload, context)
    })

    it('should resolve with an internal server error response', () => {
      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

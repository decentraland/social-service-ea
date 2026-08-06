import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  KickPlayerFromCommunityVoiceChatPayload,
  KickPlayerFromCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { kickPlayerFromCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/kick-player-from-community-voice-chat'
import { ICommsGatekeeperComponent, ICommunitiesDatabaseComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { CommunityVoiceChatNotFoundError } from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'
import { RpcServerContext } from '../../../../../src/types'

describe('when kicking a player from a community voice chat', () => {
  let kickPlayerMock: jest.MockedFn<ICommsGatekeeperComponent['kickUserFromCommunityVoiceChat']>
  let getCommunityMemberRolesMock: jest.MockedFn<ICommunitiesDatabaseComponent['getCommunityMemberRoles']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let communitiesDb: Pick<ICommunitiesDatabaseComponent, 'getCommunityMemberRoles'>
  let communityId: string
  let actingUserAddress: string
  let targetUserAddress: string
  let payload: KickPlayerFromCommunityVoiceChatPayload
  let context: RpcServerContext
  let service: ReturnType<typeof kickPlayerFromCommunityVoiceChatService>
  let result: KickPlayerFromCommunityVoiceChatResponse

  beforeEach(() => {
    communityId = 'test-community-id'
    actingUserAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'
    kickPlayerMock = jest.fn().mockResolvedValue(undefined)
    getCommunityMemberRolesMock = jest.fn()
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      kickUserFromCommunityVoiceChat: kickPlayerMock
    })
    communitiesDb = { getCommunityMemberRoles: getCommunityMemberRolesMock }
    payload = KickPlayerFromCommunityVoiceChatPayload.create({
      communityId,
      userAddress: targetUserAddress
    })
    context = { address: actingUserAddress, subscribersContext: undefined }
    service = kickPlayerFromCommunityVoiceChatService({
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

      it('should kick the target user from the voice chat room', () => {
        expect(kickPlayerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
      })

      it('should resolve both roles with a single batched query', () => {
        expect(getCommunityMemberRolesMock).toHaveBeenCalledTimes(1)
        expect(getCommunityMemberRolesMock).toHaveBeenCalledWith(communityId, [actingUserAddress, targetUserAddress])
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

      it('should not kick the owner from the voice chat room', () => {
        expect(kickPlayerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the target user is another moderator', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response, since a room ejection is reversible', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should kick the other moderator from the voice chat room', () => {
        expect(kickPlayerMock).toHaveBeenCalledWith(payload.communityId, targetUserAddress)
      })
    })

    describe('and the target user is a public community guest holding no role', () => {
      beforeEach(async () => {
        getCommunityMemberRolesMock.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator
        })
        result = await service(payload, context)
      })

      it('should resolve with an ok response', () => {
        expect(result.response?.$case).toBe('ok')
      })

      it('should kick the guest from the voice chat room', () => {
        expect(kickPlayerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
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

      it('should kick the moderator from the voice chat room', () => {
        expect(kickPlayerMock).toHaveBeenCalledWith(communityId, targetUserAddress)
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

    it('should not kick the target user from the voice chat room', () => {
      expect(kickPlayerMock).not.toHaveBeenCalled()
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

    it('should not kick the target user from the voice chat room', () => {
      expect(kickPlayerMock).not.toHaveBeenCalled()
    })
  })

  describe('and the community id is missing', () => {
    beforeEach(async () => {
      payload = KickPlayerFromCommunityVoiceChatPayload.create({
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
      payload = KickPlayerFromCommunityVoiceChatPayload.create({
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
      kickPlayerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
      result = await service(payload, context)
    })

    it('should resolve with a not found error response', () => {
      expect(result.response?.$case).toBe('notFoundError')
    })
  })

  describe('and kicking the player fails with an unknown error', () => {
    beforeEach(async () => {
      getCommunityMemberRolesMock.mockResolvedValue({
        [actingUserAddress]: CommunityRole.Owner,
        [targetUserAddress]: CommunityRole.Member
      })
      kickPlayerMock.mockRejectedValue(new Error('Unknown error'))
      result = await service(payload, context)
    })

    it('should resolve with an internal server error response', () => {
      expect(result.response?.$case).toBe('internalServerError')
    })
  })
})

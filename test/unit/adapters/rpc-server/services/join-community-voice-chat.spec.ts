import { ILoggerComponent } from '@well-known-components/interfaces'
import { JoinCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { joinCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/join-community-voice-chat'
import { ICommunityVoiceComponent } from '../../../../../src/logic/community-voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  CommunityVoiceChatNotFoundError,
  UserNotCommunityMemberError
} from '../../../../../src/logic/community-voice/errors'

function createCommunityVoiceMockedComponent({
  startCommunityVoiceChat = jest.fn(),
  joinCommunityVoiceChat = jest.fn(),
  getCommunityVoiceChat = jest.fn(),
  getActiveCommunityVoiceChats = jest.fn()
}: Partial<jest.Mocked<ICommunityVoiceComponent>>): jest.Mocked<ICommunityVoiceComponent> {
  return {
    startCommunityVoiceChat,
    joinCommunityVoiceChat,
    getCommunityVoiceChat,
    getActiveCommunityVoiceChats
  }
}

describe('when joining a community voice chat', () => {
  let joinCommunityVoiceChatMock: jest.MockedFn<ICommunityVoiceComponent['joinCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let communityVoice: jest.Mocked<ICommunityVoiceComponent>
  let communityId: string
  let userAddress: string
  let service: ReturnType<typeof joinCommunityVoiceChatService>

  beforeEach(async () => {
    joinCommunityVoiceChatMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    logs = createLogsMockedComponent()
    communityVoice = createCommunityVoiceMockedComponent({
      joinCommunityVoiceChat: joinCommunityVoiceChatMock
    })
    service = joinCommunityVoiceChatService({
      components: { communityVoice, logs }
    })
  })

  describe('and joining a community voice chat is successful', () => {
    let expectedCredentials: { connectionUrl: string }

    beforeEach(() => {
      expectedCredentials = { connectionUrl: 'test-connection-url' }
      joinCommunityVoiceChatMock.mockResolvedValue(expectedCredentials)
    })

    it('should resolve with an ok response and the credentials', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.voiceChatId).toBe(communityId)
        expect(result.response.ok.credentials).toEqual(expectedCredentials)
      }
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId: ''
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('invalidRequest')
      if (result.response?.$case === 'invalidRequest') {
        expect(result.response.invalidRequest.message).toBe('Community ID is required and cannot be empty')
      }
    })
  })

  describe('and joining a community voice chat fails with a not found error', () => {
    beforeEach(() => {
      joinCommunityVoiceChatMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
    })

    it('should resolve with a not found error response', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('notFoundError')
      if (result.response?.$case === 'notFoundError') {
        expect(result.response.notFoundError.message).toBe(
          `Community voice chat not found for community ${communityId}`
        )
      }
    })
  })

  describe('and joining a community voice chat fails with a user not member error', () => {
    beforeEach(() => {
      joinCommunityVoiceChatMock.mockRejectedValue(new UserNotCommunityMemberError(userAddress, communityId))
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          `User ${userAddress} is not a member of community ${communityId}`
        )
      }
    })
  })

  describe('and joining a community voice chat fails because user is banned', () => {
    beforeEach(() => {
      joinCommunityVoiceChatMock.mockRejectedValue(
        new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
      )
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          `The user ${userAddress} is banned from community ${communityId}`
        )
      }
    })
  })

  describe('and joining a community voice chat fails with an unknown error', () => {
    let errorMessage: string

    beforeEach(() => {
      errorMessage = 'Connection failed'
      joinCommunityVoiceChatMock.mockRejectedValue(new Error(errorMessage))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        JoinCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('internalServerError')
      if (result.response?.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toBe('Failed to join community voice chat')
      }
    })
  })
})

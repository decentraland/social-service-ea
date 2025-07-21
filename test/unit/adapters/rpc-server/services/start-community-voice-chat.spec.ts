import { ILoggerComponent } from '@well-known-components/interfaces'
import { StartCommunityVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { startCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/start-community-voice-chat'
import { ICommunityVoiceComponent } from '../../../../../src/logic/community-voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatPermissionError
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

describe('when starting a community voice chat', () => {
  let startCommunityVoiceChatMock: jest.MockedFn<ICommunityVoiceComponent['startCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let communityVoice: jest.Mocked<ICommunityVoiceComponent>
  let communityId: string
  let userAddress: string
  let service: ReturnType<typeof startCommunityVoiceChatService>

  beforeEach(async () => {
    startCommunityVoiceChatMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    logs = createLogsMockedComponent()
    communityVoice = createCommunityVoiceMockedComponent({
      startCommunityVoiceChat: startCommunityVoiceChatMock
    })
    service = startCommunityVoiceChatService({
      components: { communityVoice, logs }
    })
  })

  describe('and starting a community voice chat is successful', () => {
    let expectedCredentials: { connectionUrl: string }

    beforeEach(() => {
      expectedCredentials = { connectionUrl: 'test-connection-url' }
      startCommunityVoiceChatMock.mockResolvedValue(expectedCredentials)
    })

    it('should resolve with an ok response and the credentials', async () => {
      const result = await service(
        StartCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.credentials).toEqual(expectedCredentials)
      }
    })
  })

  describe('and community ID is missing', () => {
    it('should resolve with an invalid request response', async () => {
      const result = await service(
        StartCommunityVoiceChatPayload.create({
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

  describe('and starting a community voice chat fails with a permission error', () => {
    beforeEach(() => {
      startCommunityVoiceChatMock.mockRejectedValue(
        new CommunityVoiceChatPermissionError('Only community owners and moderators can start voice chats')
      )
    })

    it('should resolve with a forbidden error response', async () => {
      const result = await service(
        StartCommunityVoiceChatPayload.create({
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
          'Only community owners and moderators can start voice chats'
        )
      }
    })
  })

  describe('and starting a community voice chat fails with an already active error', () => {
    beforeEach(() => {
      startCommunityVoiceChatMock.mockRejectedValue(new CommunityVoiceChatAlreadyActiveError(communityId))
    })

    it('should resolve with a conflicting error response', async () => {
      const result = await service(
        StartCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('conflictingError')
      if (result.response?.$case === 'conflictingError') {
        expect(result.response.conflictingError.message).toBe(
          `Community ${communityId} already has an active voice chat`
        )
      }
    })
  })

  describe('and starting a community voice chat fails with an unknown error', () => {
    let errorMessage: string

    beforeEach(() => {
      errorMessage = 'Unexpected error'
      startCommunityVoiceChatMock.mockRejectedValue(new Error(errorMessage))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        StartCommunityVoiceChatPayload.create({
          communityId
        }),
        {
          address: userAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('internalServerError')
      if (result.response?.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toBe('Failed to start community voice chat')
      }
    })
  })
})

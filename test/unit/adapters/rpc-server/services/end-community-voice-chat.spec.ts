import { ILoggerComponent } from '@well-known-components/interfaces'

import { endCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/end-community-voice-chat'
import { ICommunityVoiceComponent } from '../../../../../src/logic/community-voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatPermissionError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError
} from '../../../../../src/logic/community-voice/errors'

function createCommunityVoiceMockedComponent({
  startCommunityVoiceChat = jest.fn(),
  endCommunityVoiceChat = jest.fn(),
  joinCommunityVoiceChat = jest.fn(),
  getCommunityVoiceChat = jest.fn(),
  getActiveCommunityVoiceChats = jest.fn(),
  getActiveCommunityVoiceChatsForUser = jest.fn()
}: Partial<jest.Mocked<ICommunityVoiceComponent>>): jest.Mocked<ICommunityVoiceComponent> {
  return {
    startCommunityVoiceChat,
    endCommunityVoiceChat,
    joinCommunityVoiceChat,
    getCommunityVoiceChat,
    getActiveCommunityVoiceChats,
    getActiveCommunityVoiceChatsForUser
  }
}

describe('when ending a community voice chat', () => {
  let endCommunityVoiceChatMock: jest.MockedFn<ICommunityVoiceComponent['endCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let communityVoice: jest.Mocked<ICommunityVoiceComponent>
  let communityId: string
  let userAddress: string
  let service: ReturnType<typeof endCommunityVoiceChatService>

  beforeEach(async () => {
    endCommunityVoiceChatMock = jest.fn()
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    logs = createLogsMockedComponent()
    communityVoice = createCommunityVoiceMockedComponent({
      endCommunityVoiceChat: endCommunityVoiceChatMock
    })
    service = endCommunityVoiceChatService({
      components: { communityVoice, logs }
    })
  })

  describe('and ending a community voice chat is successful', () => {
    beforeEach(() => {
      endCommunityVoiceChatMock.mockResolvedValue(undefined)
    })

    it('should end the community voice chat and return success message', async () => {
      const payload = { communityId }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(endCommunityVoiceChatMock).toHaveBeenCalledWith(communityId, userAddress)
      expect(result).toEqual({
        response: {
          $case: 'ok',
          ok: {
            message: 'Community voice chat ended successfully'
          }
        }
      })
    })
  })

  describe('and the user is not a member of the community', () => {
    beforeEach(() => {
      endCommunityVoiceChatMock.mockRejectedValue(new UserNotCommunityMemberError(userAddress, communityId))
    })

    it('should return forbidden error', async () => {
      const payload = { communityId }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'forbiddenError',
          forbiddenError: { message: `User ${userAddress} is not a member of community ${communityId}` }
        }
      })
    })
  })

  describe('and the user does not have permission to end voice chats', () => {
    beforeEach(() => {
      endCommunityVoiceChatMock.mockRejectedValue(
        new CommunityVoiceChatPermissionError('Only community owners and moderators can end voice chats')
      )
    })

    it('should return forbidden error', async () => {
      const payload = { communityId }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'forbiddenError',
          forbiddenError: { message: 'Only community owners and moderators can end voice chats' }
        }
      })
    })
  })

  describe('and the community voice chat is not found or not active', () => {
    beforeEach(() => {
      endCommunityVoiceChatMock.mockRejectedValue(new CommunityVoiceChatNotFoundError(communityId))
    })

    it('should return not found error', async () => {
      const payload = { communityId }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'notFoundError',
          notFoundError: { message: `Community voice chat not found for community ${communityId}` }
        }
      })
    })
  })

  describe('and the community ID is invalid', () => {
    beforeEach(() => {
      endCommunityVoiceChatMock.mockRejectedValue(new InvalidCommunityIdError())
    })

    it('should return invalid request error', async () => {
      const payload = { communityId: '' }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Community ID is required and cannot be empty' }
        }
      })
    })
  })

  describe('and an unexpected error occurs', () => {
    const errorMessage = 'Unexpected error'

    beforeEach(() => {
      endCommunityVoiceChatMock.mockRejectedValue(new Error(errorMessage))
    })

    it('should return internal server error', async () => {
      const payload = { communityId }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Failed to end community voice chat' }
        }
      })
    })
  })

  describe('and the community ID is missing', () => {
    it('should return invalid request error for missing community ID', async () => {
      const payload = { communityId: '' }
      const context = { address: userAddress, subscribersContext: undefined }

      const result = await service(payload, context)

      expect(result).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Community ID is required and cannot be empty' }
        }
      })
    })
  })
})

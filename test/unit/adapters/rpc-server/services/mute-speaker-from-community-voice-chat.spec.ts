import { ILoggerComponent } from '@well-known-components/interfaces'
import { muteSpeakerFromCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/mute-speaker-from-community-voice-chat'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  CommunityVoiceChatPermissionError,
  InvalidCommunityIdError,
  InvalidUserAddressError
} from '../../../../../src/logic/community-voice/errors'
import { ICommunityVoiceComponent } from '../../../../../src/logic/community-voice/types'
import {
  MuteSpeakerFromCommunityVoiceChatPayload,
  MuteSpeakerFromCommunityVoiceChatResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('MuteSpeakerFromCommunityVoiceChat RPC Service', () => {
  let logs: ILoggerComponent
  let mockCommunityVoice: jest.Mocked<ICommunityVoiceComponent>
  let service: (
    request: MuteSpeakerFromCommunityVoiceChatPayload,
    context: any
  ) => Promise<MuteSpeakerFromCommunityVoiceChatResponse>
  let request: MuteSpeakerFromCommunityVoiceChatPayload

  const communityId = 'test-community-id'
  const targetUserAddress = '0x1234567890abcdef'
  const userAddress = '0xabcdef1234567890'

  beforeEach(() => {
    logs = createLogsMockedComponent()
    mockCommunityVoice = {
      startCommunityVoiceChat: jest.fn(),
      endCommunityVoiceChat: jest.fn(),
      joinCommunityVoiceChat: jest.fn(),
      muteSpeakerInCommunityVoiceChat: jest.fn(),
      getCommunityVoiceChat: jest.fn(),
      getActiveCommunityVoiceChats: jest.fn(),
      getActiveCommunityVoiceChatsForUser: jest.fn()
    }

    service = muteSpeakerFromCommunityVoiceChatService({
      components: {
        communityVoice: mockCommunityVoice,
        logs
      }
    })

    request = {
      communityId,
      userAddress: targetUserAddress,
      muted: true
    }
  })

  describe('when the request is valid', () => {
    beforeEach(() => {
      mockCommunityVoice.muteSpeakerInCommunityVoiceChat.mockResolvedValue(undefined)
    })

    describe('when muting a user', () => {
      beforeEach(() => {
        request.muted = true
      })

      it('should return successful response with muted=true', async () => {
        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              muted: true
            }
          }
        })
        expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress,
          userAddress,
          true
        )
      })
    })

    describe('when unmuting a user', () => {
      beforeEach(() => {
        request.muted = false
      })

      it('should return successful response with muted=false', async () => {
        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              muted: false
            }
          }
        })
        expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress,
          userAddress,
          false
        )
      })
    })
  })

  describe('when there are permission errors', () => {
    beforeEach(() => {
      mockCommunityVoice.muteSpeakerInCommunityVoiceChat.mockRejectedValue(
        new CommunityVoiceChatPermissionError(
          'Only community owners, moderators, or the user themselves can mute/unmute speakers'
        )
      )
    })

    it('should return forbidden error when user lacks permissions', async () => {
      const result = await service(request, { address: userAddress } as any)

      expect(result).toEqual({
        response: {
          $case: 'forbiddenError',
          forbiddenError: {
            message: 'Only community owners, moderators, or the user themselves can mute/unmute speakers'
          }
        }
      })
      expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
        communityId,
        targetUserAddress,
        userAddress,
        true
      )
    })
  })

  describe('when there are validation errors', () => {
    describe('when community ID is invalid', () => {
      beforeEach(() => {
        mockCommunityVoice.muteSpeakerInCommunityVoiceChat.mockRejectedValue(new InvalidCommunityIdError())
      })

      it('should return invalid request error', async () => {
        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: expect.any(String)
            }
          }
        })
        expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalled()
      })
    })

    describe('when user address is invalid', () => {
      beforeEach(() => {
        mockCommunityVoice.muteSpeakerInCommunityVoiceChat.mockRejectedValue(new InvalidUserAddressError())
      })

      it('should return invalid request error', async () => {
        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: expect.any(String)
            }
          }
        })
        expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalled()
      })
    })
  })

  describe('when there are service errors', () => {
    describe('when an unknown error occurs', () => {
      beforeEach(() => {
        mockCommunityVoice.muteSpeakerInCommunityVoiceChat.mockRejectedValue(new Error('Unexpected error'))
      })

      it('should return internal server error with error details', async () => {
        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'internalServerError',
            internalServerError: {
              message: 'Failed to mute/unmute speaker from community voice chat: Unexpected error'
            }
          }
        })
        expect(mockCommunityVoice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalled()
      })
    })
  })
})

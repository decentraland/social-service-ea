import { ILoggerComponent } from '@well-known-components/interfaces'
import { muteSpeakerFromCommunityVoiceChatService } from '../../../../../src/controllers/handlers/rpc/mute-speaker-from-community-voice-chat'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError
} from '../../../../../src/logic/community-voice/errors'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import { CommunityRole } from '../../../../../src/types/entities'

// Temporary types until they are generated from protocol
type MuteSpeakerFromCommunityVoiceChatPayload = {
  communityId: string
  userAddress: string
  muted: boolean
}

describe('when muting speaker from community voice chat', () => {
  let muteSpeakerMock: jest.MockedFn<ICommsGatekeeperComponent['muteSpeakerInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDB: {
    getCommunityMemberRole: jest.MockedFunction<any>
  }
  let communityId: string
  let userAddress: string
  let targetUserAddress: string
  let service: ReturnType<typeof muteSpeakerFromCommunityVoiceChatService>

  beforeEach(() => {
    communityId = 'test-community-id'
    userAddress = '0x123456789abcdef'
    targetUserAddress = '0x987654321fedcba'

    muteSpeakerMock = jest.fn()
    logs = createLogsMockedComponent()
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      muteSpeakerInCommunityVoiceChat: muteSpeakerMock
    })

    mockCommunitiesDB = {
      getCommunityMemberRole: jest.fn()
    }

    service = muteSpeakerFromCommunityVoiceChatService({
      components: {
        commsGatekeeper,
        logs,
        communitiesDb: mockCommunitiesDB as any
      }
    })
  })

  describe('when the request is valid', () => {
    describe('and the acting user is a moderator', () => {
      beforeEach(() => {
        muteSpeakerMock.mockResolvedValue(undefined)
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      })

      it('should return successful response when muting a user', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              message: 'User muted successfully'
            }
          }
        })
        expect(muteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress, true)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
      })

      it('should return successful response when unmuting a user', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: false
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              message: 'User unmuted successfully'
            }
          }
        })
        expect(muteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress, false)
      })
    })

    describe('and the acting user is an owner', () => {
      beforeEach(() => {
        muteSpeakerMock.mockResolvedValue(undefined)
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      })

      it('should return successful response when owner mutes a user', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              message: 'User muted successfully'
            }
          }
        })
        expect(muteSpeakerMock).toHaveBeenCalledWith(communityId, targetUserAddress, true)
      })
    })

    describe('and the user is muting themselves', () => {
      beforeEach(() => {
        muteSpeakerMock.mockResolvedValue(undefined)
      })

      it('should return successful response when user mutes themselves', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: userAddress, // Same as acting user
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              message: 'User muted successfully'
            }
          }
        })
        expect(muteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress, true)
        expect(mockCommunitiesDB.getCommunityMemberRole).not.toHaveBeenCalled()
      })

      it('should return successful response when user unmutes themselves', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: userAddress, // Same as acting user
          muted: false
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'ok',
            ok: {
              message: 'User unmuted successfully'
            }
          }
        })
        expect(muteSpeakerMock).toHaveBeenCalledWith(communityId, userAddress, false)
      })
    })
  })

  describe('when there are permission errors', () => {
    describe('and the acting user is only a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      })

      it('should return forbidden error when member tries to mute another user', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'forbiddenError',
            forbiddenError: {
              message: 'Only community owners, moderators, or the user themselves can mute/unmute speakers'
            }
          }
        })
        expect(muteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the acting user has no role', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should return forbidden error when user with no role tries to mute another user', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'forbiddenError',
            forbiddenError: {
              message: 'Only community owners, moderators, or the user themselves can mute/unmute speakers'
            }
          }
        })
        expect(muteSpeakerMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('when there are validation errors', () => {
    describe('and the community ID is missing', () => {
      it('should return invalid request error', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId: '',
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: expect.any(String)
            }
          }
        })
        expect(muteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the user address is missing', () => {
      it('should return invalid request error', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: '',
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: expect.any(String)
            }
          }
        })
        expect(muteSpeakerMock).not.toHaveBeenCalled()
      })
    })

    describe('and the muted value is invalid', () => {
      it('should return internal server error', async () => {
        const request = {
          communityId,
          userAddress: targetUserAddress,
          muted: 'invalid' as any
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'internalServerError',
            internalServerError: {
              message: 'Failed to mute/unmute speaker from community voice chat'
            }
          }
        })
        expect(muteSpeakerMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('when there are service errors', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
    })

    describe('and the voice chat is not found', () => {
      beforeEach(() => {
        muteSpeakerMock.mockRejectedValue(new CommunityVoiceChatNotFoundError('Voice chat not found'))
      })

      it('should return not found error', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'notFoundError',
            notFoundError: {
              message: 'Voice chat not found'
            }
          }
        })
      })
    })

    describe('and the user is not a community member', () => {
      beforeEach(() => {
        muteSpeakerMock.mockRejectedValue(new UserNotCommunityMemberError(targetUserAddress, communityId))
      })

      it('should return forbidden error', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'forbiddenError',
            forbiddenError: {
              message: 'User 0x987654321fedcba is not a member of community test-community-id'
            }
          }
        })
      })
    })

    describe('and there is an unknown error', () => {
      beforeEach(() => {
        muteSpeakerMock.mockRejectedValue(new Error('Unknown error'))
      })

      it('should return internal server error', async () => {
        const request: MuteSpeakerFromCommunityVoiceChatPayload = {
          communityId,
          userAddress: targetUserAddress,
          muted: true
        }

        const result = await service(request, { address: userAddress } as any)

        expect(result).toEqual({
          response: {
            $case: 'internalServerError',
            internalServerError: {
              message: 'Failed to mute/unmute speaker from community voice chat'
            }
          }
        })
      })
    })
  })
})

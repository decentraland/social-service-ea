import { ICommsGatekeeperComponent, CommunityRole } from '../../../src/types'
import { createCommsGatekeeperComponent } from '../../../src/adapters/comms-gatekeeper'
import { createMockConfigComponent } from '../../mocks/components/config'
import { mockLogs } from '../../mocks/components'
import nock from 'nock'

describe('Comms Gatekeeper Community Voice Chat', () => {
  let commsGatekeeper: ICommsGatekeeperComponent
  let mockFetch: jest.Mock
  const gatekeeperUrl = 'default-value' // Use the actual mock value
  const gatekeeperToken = 'default-value' // Use the actual mock value
  const testCommunityId = 'test-community-123'
  const testUserAddress = '0x1234567890123456789012345678901234567890'

  beforeEach(async () => {
    mockFetch = jest.fn()

    // Create a mock config with default behavior
    const mockConfig = createMockConfigComponent({
      requireString: jest.fn().mockReturnValue('default-value')
    })

    commsGatekeeper = await createCommsGatekeeperComponent({
      config: mockConfig,
      logs: mockLogs,
      fetcher: { fetch: mockFetch }
    })
  })

  afterEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  describe('when getting community voice chat credentials', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              connection_url: 'wss://livekit.test/room?token=abc123'
            })
        })
      })

      it('should return connection URL', async () => {
        const result = await commsGatekeeper.getCommunityVoiceChatCredentials(testCommunityId, testUserAddress, CommunityRole.Member)

        expect(result).toEqual({
          connectionUrl: 'wss://livekit.test/room?token=abc123'
        })
        expect(mockFetch).toHaveBeenCalledWith(`${gatekeeperUrl}/community-voice-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatekeeperToken}`
          },
          body: JSON.stringify({
            community_id: testCommunityId,
            user_address: testUserAddress,
            action: 'join',
            user_role: CommunityRole.Member
          })
        })
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Community voice chat not found')
        })
      })

      it('should throw an error', async () => {
        await expect(
          commsGatekeeper.getCommunityVoiceChatCredentials(testCommunityId, testUserAddress, CommunityRole.Member)
        ).rejects.toThrow('Server responded with status 404')
      })
    })
  })

  describe('when creating a community voice chat room', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              connection_url: 'wss://livekit.test/room?token=abc123'
            })
        })
      })

      it('should create room successfully and return connection URL', async () => {
        const result = await commsGatekeeper.createCommunityVoiceChatRoom(testCommunityId, testUserAddress, CommunityRole.Owner)

        expect(result).toEqual({
          connectionUrl: 'wss://livekit.test/room?token=abc123'
        })
        expect(mockFetch).toHaveBeenCalledWith(`${gatekeeperUrl}/community-voice-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatekeeperToken}`
          },
          body: JSON.stringify({
            community_id: testCommunityId,
            user_address: testUserAddress,
            action: 'create',
            user_role: CommunityRole.Owner
          })
        })
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 409,
          text: () => Promise.resolve('Community voice chat already active')
        })
      })

      it('should throw an error', async () => {
        await expect(commsGatekeeper.createCommunityVoiceChatRoom(testCommunityId, testUserAddress, CommunityRole.Owner)).rejects.toThrow(
          'Server responded with status 409'
        )
      })
    })
  })

  describe('when updating user metadata in community voice chat', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true
            })
        })
      })

      it('should update metadata successfully', async () => {
        const metadata = { isRequestingToSpeak: true, canPublishTracks: false }
        await commsGatekeeper.updateUserMetadataInCommunityVoiceChat(testCommunityId, testUserAddress, metadata)

        expect(mockFetch).toHaveBeenCalledWith(
          `${gatekeeperUrl}/community-voice-chat/${testCommunityId}/users/${testUserAddress}/speak-request`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gatekeeperToken}`
            }
          }
        )
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Invalid metadata')
        })
      })

      it('should throw an error', async () => {
        const metadata = { isRequestingToSpeak: true }
        await expect(
          commsGatekeeper.updateUserMetadataInCommunityVoiceChat(testCommunityId, testUserAddress, metadata)
        ).rejects.toThrow('Server responded with status 400')
      })
    })
  })

  describe('when getting community voice chat status', () => {
    describe('and the request is successful with active chat', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              active: true,
              participant_count: 5,
              moderator_count: 2
            })
        })
      })

      it('should return chat status', async () => {
        const result = await commsGatekeeper.getCommunityVoiceChatStatus(testCommunityId)

        expect(result).toEqual({
          isActive: true,
          participantCount: 5,
          moderatorCount: 2
        })
        expect(mockFetch).toHaveBeenCalledWith(`${gatekeeperUrl}/community-voice-chat/${testCommunityId}/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatekeeperToken}`
          }
        })
      })
    })

    describe('and the request is successful with inactive chat', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              active: false,
              participant_count: 0,
              moderator_count: 0
            })
        })
      })

      it('should return inactive status', async () => {
        const result = await commsGatekeeper.getCommunityVoiceChatStatus(testCommunityId)

        expect(result).toEqual({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })
    })

    describe('and the request fails with 404', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Community voice chat not found')
        })
      })

      it('should return null', async () => {
        const result = await commsGatekeeper.getCommunityVoiceChatStatus(testCommunityId)

        expect(result).toBeNull()
      })
    })

    describe('and the request fails with non-404 error', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal server error')
        })
      })

      it('should throw an error', async () => {
        await expect(commsGatekeeper.getCommunityVoiceChatStatus(testCommunityId)).rejects.toThrow(
          'Server responded with status 500'
        )
      })
    })
  })

  describe('when checking if user is in a voice chat', () => {
    describe('and the request is successful with user in chat', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              is_user_in_voice_chat: true
            })
        })
      })

      it('should return true', async () => {
        const result = await commsGatekeeper.isUserInAVoiceChat(testUserAddress)

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(`${gatekeeperUrl}/users/${testUserAddress}/voice-chat-status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatekeeperToken}`
          }
        })
      })
    })

    describe('and the request is successful with user not in chat', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              is_user_in_voice_chat: false
            })
        })
      })

      it('should return false', async () => {
        const result = await commsGatekeeper.isUserInAVoiceChat(testUserAddress)

        expect(result).toBe(false)
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal server error')
        })
      })

      it('should throw an error', async () => {
        await expect(commsGatekeeper.isUserInAVoiceChat(testUserAddress)).rejects.toThrow(
          'Server responded with status 500'
        )
      })
    })
  })

  describe('when requesting to speak in community voice chat', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      })

      it('should request to speak successfully', async () => {
        await commsGatekeeper.requestToSpeakInCommunityVoiceChat(testCommunityId, testUserAddress)

        expect(mockFetch).toHaveBeenCalledWith(
          `${gatekeeperUrl}/community-voice-chat/${testCommunityId}/users/${testUserAddress}/speak-request`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gatekeeperToken}`
            }
          }
        )
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden')
        })
      })

      it('should throw an error', async () => {
        await expect(
          commsGatekeeper.requestToSpeakInCommunityVoiceChat(testCommunityId, testUserAddress)
        ).rejects.toThrow('Server responded with status 403')
      })
    })
  })

  describe('when promoting speaker in community voice chat', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      })

      it('should promote speaker successfully', async () => {
        await commsGatekeeper.promoteSpeakerInCommunityVoiceChat(testCommunityId, testUserAddress)

        expect(mockFetch).toHaveBeenCalledWith(
          `${gatekeeperUrl}/community-voice-chat/${testCommunityId}/users/${testUserAddress}/speaker`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gatekeeperToken}`
            }
          }
        )
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('User not found in voice chat')
        })
      })

      it('should throw an error', async () => {
        await expect(
          commsGatekeeper.promoteSpeakerInCommunityVoiceChat(testCommunityId, testUserAddress)
        ).rejects.toThrow('Server responded with status 404')
      })
    })
  })

  describe('when demoting speaker in community voice chat', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      })

      it('should demote speaker successfully', async () => {
        await commsGatekeeper.demoteSpeakerInCommunityVoiceChat(testCommunityId, testUserAddress)

        expect(mockFetch).toHaveBeenCalledWith(
          `${gatekeeperUrl}/community-voice-chat/${testCommunityId}/users/${testUserAddress}/speaker`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gatekeeperToken}`
            }
          }
        )
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('User not found in voice chat')
        })
      })

      it('should throw an error', async () => {
        await expect(
          commsGatekeeper.demoteSpeakerInCommunityVoiceChat(testCommunityId, testUserAddress)
        ).rejects.toThrow('Server responded with status 404')
      })
    })
  })

  describe('when kicking user from community voice chat', () => {
    describe('and the request is successful', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({})
        })
      })

      it('should kick user successfully', async () => {
        await commsGatekeeper.kickUserFromCommunityVoiceChat(testCommunityId, testUserAddress)

        expect(mockFetch).toHaveBeenCalledWith(
          `${gatekeeperUrl}/community-voice-chat/${testCommunityId}/users/${testUserAddress}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gatekeeperToken}`
            }
          }
        )
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden')
        })
      })

      it('should throw an error', async () => {
        await expect(
          commsGatekeeper.kickUserFromCommunityVoiceChat(testCommunityId, testUserAddress)
        ).rejects.toThrow('Server responded with status 403')
      })
    })
  })
})

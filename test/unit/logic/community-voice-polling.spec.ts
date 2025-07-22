import { createCommunityVoiceChatPollingComponent } from '../../../src/logic/community-voice/community-voice-polling'
import { createCommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { AppComponents } from '../../../src/types'

describe('Community Voice Chat Polling Component', () => {
  let polling: ReturnType<typeof createCommunityVoiceChatPollingComponent>
  let cache: ReturnType<typeof createCommunityVoiceChatCacheComponent>
  let mockComponents: Pick<AppComponents, 'logs' | 'commsGatekeeper' | 'pubsub' | 'redis'>
  let mockLogger: jest.Mocked<any>
  let mockGetActiveCommunityVoiceChats: jest.MockedFunction<any>
  let mockUpdateAndDetectChange: jest.MockedFunction<any>
  let mockGetCommunityVoiceChatStatus: jest.MockedFunction<any>
  let mockPublishInChannel: jest.MockedFunction<any>

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    const mockRedisClient = {
      keys: jest.fn(),
      del: jest.fn()
    }

    mockGetCommunityVoiceChatStatus = jest.fn()
    mockPublishInChannel = jest.fn()

    mockComponents = {
      logs: {
        getLogger: jest.fn().mockReturnValue(mockLogger)
      },
      commsGatekeeper: {
        getCommunityVoiceChatStatus: mockGetCommunityVoiceChatStatus
      },
      pubsub: {
        publishInChannel: mockPublishInChannel
      },
      redis: {
        put: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        client: mockRedisClient
      }
    } as any

    cache = createCommunityVoiceChatCacheComponent({
      logs: mockComponents.logs,
      redis: mockComponents.redis
    })

    // Mock cache methods
    mockGetActiveCommunityVoiceChats = jest.spyOn(cache, 'getActiveCommunityVoiceChats')
    mockUpdateAndDetectChange = jest.spyOn(cache, 'updateAndDetectChange')

    polling = createCommunityVoiceChatPollingComponent({
      ...mockComponents,
      communityVoiceChatCache: cache
    })
  })

  describe('when checking all active voice chats', () => {
    describe('when there are no active voice chats', () => {
      beforeEach(() => {
        mockGetActiveCommunityVoiceChats.mockResolvedValue([])
      })

      it('should handle empty active voice chats list', async () => {
        await polling.checkAllVoiceChats()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
        expect(stats.endedDetected).toBe(0)
        expect(stats.errors).toBe(0)
      })
    })

    describe('when checking status and detecting no changes', () => {
      beforeEach(() => {
        const communityId = 'community-1'
        const createdAt = Date.now() - 10000
        const activeChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })
        mockUpdateAndDetectChange.mockResolvedValue({
          wasActive: true,
          isNowActive: true,
          justEnded: false,
          cachedChat: activeChat
        })
      })

      it('should check status of active voice chats and detect no changes', async () => {
        const communityId = 'community-1'

        await polling.checkAllVoiceChats()

        expect(mockGetCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
        expect(mockUpdateAndDetectChange).toHaveBeenCalledWith(communityId, true)
        expect(mockPublishInChannel).not.toHaveBeenCalled()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
        expect(stats.endedDetected).toBe(0)
      })
    })

    describe('when detecting voice chat becomes inactive', () => {
      beforeEach(() => {
        const communityId = 'community-1'
        const createdAt = Date.now() - 10000
        const activeChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
        mockUpdateAndDetectChange.mockResolvedValue({
          wasActive: true,
          isNowActive: false,
          justEnded: true,
          cachedChat: activeChat
        })
        mockPublishInChannel.mockResolvedValue(undefined)
      })

      it('should detect and send ended notification when voice chat becomes inactive', async () => {
        const communityId = 'community-1'

        await polling.checkAllVoiceChats()

        expect(mockPublishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
          communityId,
          status: 'ended',
          ended_at: expect.any(Number)
        })

        const stats = polling.getStats()
        expect(stats.endedDetected).toBe(1)
      })
    })

    describe('when handling 404 errors', () => {
      beforeEach(() => {
        const communityId = 'community-1'
        const createdAt = Date.now() - 10000
        const activeChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockRejectedValue(new Error('404 not found'))
        mockUpdateAndDetectChange.mockResolvedValue({
          wasActive: true,
          isNowActive: false,
          justEnded: true,
          cachedChat: activeChat
        })
        mockPublishInChannel.mockResolvedValue(undefined)
      })

      it('should handle 404 errors as voice chat ended', async () => {
        const communityId = 'community-1'

        await polling.checkAllVoiceChats()

        expect(mockUpdateAndDetectChange).toHaveBeenCalledWith(communityId, null)
        expect(mockPublishInChannel).toHaveBeenCalledWith(
          COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL,
          expect.objectContaining({
            communityId,
            status: 'ended'
          })
        )

        const stats = polling.getStats()
        expect(stats.endedDetected).toBe(1)
        expect(stats.errors).toBe(1)
      })
    })

    describe('when handling multiple voice chats with mixed results', () => {
      beforeEach(() => {
        const activeChat1 = {
          communityId: 'community-1',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }

        const activeChat2 = {
          communityId: 'community-2',
          isActive: true,
          lastChecked: Date.now() - 3000,
          createdAt: Date.now() - 8000
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat1, activeChat2])
        mockGetCommunityVoiceChatStatus
          .mockResolvedValueOnce({ isActive: true })
          .mockResolvedValueOnce({ isActive: false })
        
        mockUpdateAndDetectChange
          .mockResolvedValueOnce({
            wasActive: true,
            isNowActive: true,
            justEnded: false,
            cachedChat: activeChat1
          })
          .mockResolvedValueOnce({
            wasActive: true,
            isNowActive: false,
            justEnded: true,
            cachedChat: activeChat2
          })
        
        mockPublishInChannel.mockResolvedValue(undefined)
      })

      it('should handle multiple voice chats with mixed results', async () => {
        await polling.checkAllVoiceChats()

        expect(mockPublishInChannel).toHaveBeenCalledTimes(1)
        expect(mockPublishInChannel).toHaveBeenCalledWith(
          COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL,
          expect.objectContaining({
            communityId: 'community-2',
            status: 'ended'
          })
        )

        const stats = polling.getStats()
        expect(stats.endedDetected).toBe(1)
        expect(stats.errors).toBe(0)
      })
    })

    describe('when handling comms-gatekeeper errors gracefully', () => {
      beforeEach(() => {
        const activeChat = {
          communityId: 'community-1',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockRejectedValue(new Error('Connection timeout'))
      })

      it('should handle comms-gatekeeper errors gracefully', async () => {
        await polling.checkAllVoiceChats()

        expect(mockPublishInChannel).not.toHaveBeenCalled()

        const stats = polling.getStats()
        expect(stats.endedDetected).toBe(0)
        expect(stats.errors).toBe(1)
      })
    })
  })

  describe('when starting the polling service', () => {
    describe('when starting for the first time', () => {
      beforeEach(() => {
        mockGetActiveCommunityVoiceChats.mockResolvedValue([])
      })

      it('should start polling and perform initial check', async () => {
        await polling.start()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
      })
    })

    describe('when already running', () => {
      beforeEach(() => {
        mockGetActiveCommunityVoiceChats.mockResolvedValue([])
      })

      it('should not start if already running', async () => {
        await polling.start()
        await polling.start()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
      })
    })
  })

  describe('when stopping the polling service', () => {
    describe('when stopping after starting', () => {
      beforeEach(() => {
        mockGetActiveCommunityVoiceChats.mockResolvedValue([])
      })

      it('should stop polling without errors', async () => {
        await polling.start()
        await polling.stop()

        await expect(polling.stop()).resolves.not.toThrow()
      })
    })

    describe('when stopping without starting', () => {
      it('should handle stopping non-running polling gracefully', async () => {
        await polling.stop()

        await expect(polling.stop()).resolves.not.toThrow()
      })
    })
  })

  describe('when retrieving polling statistics', () => {
    describe('when getting initial stats', () => {
      it('should return correct initial stats', () => {
        const stats = polling.getStats()

        expect(stats).toEqual({
          totalChecks: 0,
          endedDetected: 0,
          errors: 0,
          lastCheck: null
        })
      })
    })

    describe('when tracking stats after operations', () => {
      beforeEach(() => {
        const activeChat = {
          communityId: 'community-1',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
        mockUpdateAndDetectChange.mockResolvedValue({
          wasActive: true,
          isNowActive: false,
          justEnded: true,
          cachedChat: activeChat
        })
        mockPublishInChannel.mockResolvedValue(undefined)
      })

      it('should track stats correctly after operations', async () => {
        await polling.checkAllVoiceChats()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
        expect(stats.endedDetected).toBe(1)
        expect(stats.errors).toBe(0)
        expect(stats.lastCheck).toBeGreaterThan(0)
      })
    })
  })

  describe('when handling service errors', () => {
    describe('when cache throws an error', () => {
      beforeEach(() => {
        mockGetActiveCommunityVoiceChats.mockRejectedValue(new Error('Cache error'))
      })

      it('should handle cache errors gracefully', async () => {
        await polling.checkAllVoiceChats()

        const stats = polling.getStats()
        expect(stats.totalChecks).toBe(1)
        expect(stats.errors).toBe(1)
      })
    })

    describe('when pubsub throws an error', () => {
      beforeEach(() => {
        const activeChat = {
          communityId: 'community-1',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }

        mockGetActiveCommunityVoiceChats.mockResolvedValue([activeChat])
        mockGetCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
        mockUpdateAndDetectChange.mockResolvedValue({
          wasActive: true,
          isNowActive: false,
          justEnded: true,
          cachedChat: activeChat
        })
        mockPublishInChannel.mockRejectedValue(new Error('Pubsub error'))
      })

      it('should handle pubsub errors gracefully', async () => {
        await expect(polling.checkAllVoiceChats()).resolves.not.toThrow()

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Error checking voice chat status for community community-1'),
          expect.objectContaining({
            error: 'Pubsub error'
          })
        )

        const stats = polling.getStats()
        expect(stats.errors).toBeGreaterThan(0)
        expect(stats.totalChecks).toBeGreaterThan(0)
      })
    })
  })
})

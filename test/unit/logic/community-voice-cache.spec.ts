import { createCommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../src/types'

describe('Community Voice Chat Cache Component', () => {
  let cache: ReturnType<typeof createCommunityVoiceChatCacheComponent>
  let mockComponents: Pick<AppComponents, 'logs' | 'redis'>
  let mockRedisGet: jest.MockedFunction<any>
  let mockRedisPut: jest.MockedFunction<any>
  let mockRedisKeys: jest.MockedFunction<any>
  let mockRedisDel: jest.MockedFunction<any>

  beforeEach(() => {
    mockRedisGet = jest.fn()
    mockRedisPut = jest.fn()
    mockRedisKeys = jest.fn()
    mockRedisDel = jest.fn()

    const mockRedisClient = {
      keys: mockRedisKeys,
      del: mockRedisDel
    }

    mockComponents = {
      logs: {
        getLogger: jest.fn().mockReturnValue({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        })
      },
      redis: {
        put: mockRedisPut,
        get: mockRedisGet,
        client: mockRedisClient
      }
    } as any

    cache = createCommunityVoiceChatCacheComponent(mockComponents)
  })

  describe('when setting community voice chat data', () => {
    describe('when adding a new community voice chat', () => {
      beforeEach(() => {
        mockRedisPut.mockResolvedValue(undefined)
        mockRedisGet.mockResolvedValue(null)
      })

      it('should add a new community voice chat to cache', async () => {
        const communityId = 'test-community-123'
        const isActive = true
        const createdAt = Date.now()

        await cache.setCommunityVoiceChat(communityId, isActive, createdAt)

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-123',
          expect.objectContaining({
            communityId,
            isActive: true,
            createdAt
          }),
          { EX: 24 * 60 * 60 }
        )
      })
    })

    describe('when updating existing community voice chat', () => {
      beforeEach(() => {
        mockRedisPut.mockResolvedValue(undefined)
      })

      it('should update existing community voice chat preserving createdAt', async () => {
        const communityId = 'test-community-123'
        const originalCreatedAt = Date.now() - 10000
        const existingChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: originalCreatedAt
        }

        mockRedisGet.mockResolvedValue(existingChat)

        await cache.setCommunityVoiceChat(communityId, false)

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-123',
          expect.objectContaining({
            communityId,
            isActive: false,
            createdAt: originalCreatedAt // Should preserve original
          }),
          { EX: 24 * 60 * 60 }
        )
      })
    })
  })

  describe('when retrieving community voice chat data', () => {
    describe('when community does not exist', () => {
      beforeEach(() => {
        mockRedisGet.mockResolvedValue(null)
      })

      it('should return null for non-existent community', async () => {
        const result = await cache.getCommunityVoiceChat('non-existent')

        expect(result).toBeNull()
        expect(mockRedisGet).toHaveBeenCalledWith('community-voice-chat:non-existent')
      })
    })

    describe('when community exists in cache', () => {
      beforeEach(() => {
        const cachedChat = {
          communityId: 'test-community-123',
          isActive: true,
          lastChecked: Date.now(),
          createdAt: Date.now() - 10000
        }
        mockRedisGet.mockResolvedValue(cachedChat)
      })

      it('should return cached community voice chat data', async () => {
        const communityId = 'test-community-123'
        const cachedChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now(),
          createdAt: Date.now() - 10000
        }

        mockRedisGet.mockResolvedValue(cachedChat)

        const result = await cache.getCommunityVoiceChat(communityId)

        expect(result).toEqual(cachedChat)
        expect(mockRedisGet).toHaveBeenCalledWith('community-voice-chat:test-community-123')
      })
    })

    describe('when Redis throws an error', () => {
      beforeEach(() => {
        mockRedisGet.mockRejectedValue(new Error('Redis error'))
      })

      it('should handle Redis errors gracefully', async () => {
        const result = await cache.getCommunityVoiceChat('test-community')

        expect(result).toBeNull()
      })
    })
  })

  describe('when removing community voice chat data', () => {
    describe('when removal is successful', () => {
      beforeEach(() => {
        mockRedisDel.mockResolvedValue(1)
      })

      it('should remove community voice chat from cache', async () => {
        const communityId = 'test-community-123'

        await cache.removeCommunityVoiceChat(communityId)

        expect(mockRedisDel).toHaveBeenCalledWith('community-voice-chat:test-community-123')
      })
    })

    describe('when Redis throws an error', () => {
      beforeEach(() => {
        mockRedisDel.mockRejectedValue(new Error('Redis error'))
      })

      it('should handle Redis errors gracefully', async () => {
        await expect(cache.removeCommunityVoiceChat('test-community')).resolves.not.toThrow()
      })
    })
  })

  describe('when retrieving active community voice chats', () => {
    describe('when there are active and inactive chats', () => {
      beforeEach(() => {
        const keys = ['community-voice-chat:active-1', 'community-voice-chat:inactive-1', 'community-voice-chat:active-2']
        const activeChat1 = { communityId: 'active-1', isActive: true, lastChecked: Date.now(), createdAt: Date.now() }
        const inactiveChat = {
          communityId: 'inactive-1',
          isActive: false,
          lastChecked: Date.now(),
          createdAt: Date.now()
        }
        const activeChat2 = { communityId: 'active-2', isActive: true, lastChecked: Date.now(), createdAt: Date.now() }

        mockRedisKeys.mockResolvedValue(keys)
        mockRedisGet
          .mockResolvedValueOnce(activeChat1)
          .mockResolvedValueOnce(inactiveChat)
          .mockResolvedValueOnce(activeChat2)
      })

      it('should return only active voice chats', async () => {
        const active = await cache.getActiveCommunityVoiceChats()

        expect(active).toHaveLength(2)
        expect(active.map((c) => c.communityId)).toEqual(expect.arrayContaining(['active-1', 'active-2']))
      })
    })

    describe('when there are no active voice chats', () => {
      beforeEach(() => {
        mockRedisKeys.mockResolvedValue(['community-voice-chat:inactive-1'])
        mockRedisGet.mockResolvedValue({
          communityId: 'inactive-1',
          isActive: false,
          lastChecked: Date.now(),
          createdAt: Date.now()
        })
      })

      it('should return empty array when no active voice chats exist', async () => {
        const active = await cache.getActiveCommunityVoiceChats()

        expect(active).toHaveLength(0)
      })
    })

    describe('when Redis throws an error', () => {
      beforeEach(() => {
        mockRedisKeys.mockRejectedValue(new Error('Redis error'))
      })

      it('should handle Redis errors gracefully', async () => {
        const active = await cache.getActiveCommunityVoiceChats()

        expect(active).toEqual([])
      })
    })
  })

  describe('when updating and detecting status changes', () => {
    describe('when voice chat ends (active to inactive)', () => {
      beforeEach(() => {
        const existingChat = {
          communityId: 'test-community-123',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }
        mockRedisGet.mockResolvedValue(existingChat)
      })

      it('should detect when voice chat ends (active to inactive)', async () => {
        const communityId = 'test-community-123'
        const existingChat = {
          communityId,
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }

        mockRedisGet.mockResolvedValue(existingChat)

        const result = await cache.updateAndDetectChange(communityId, false)

        expect(result.wasActive).toBe(true)
        expect(result.isNowActive).toBe(false)
        expect(result.justEnded).toBe(true)
        expect(result.cachedChat).toEqual(existingChat)
      })
    })

    describe('when voice chat starts (inactive to active)', () => {
      beforeEach(() => {
        const existingChat = {
          communityId: 'test-community-123',
          isActive: false,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }
        mockRedisGet.mockResolvedValue(existingChat)
      })

      it('should not detect end when voice chat starts (inactive to active)', async () => {
        const communityId = 'test-community-123'

        const result = await cache.updateAndDetectChange(communityId, true)

        expect(result.wasActive).toBe(false)
        expect(result.isNowActive).toBe(true)
        expect(result.justEnded).toBe(false)
      })
    })

    describe('when status becomes null (404/error)', () => {
      beforeEach(() => {
        const existingChat = {
          communityId: 'test-community-123',
          isActive: true,
          lastChecked: Date.now() - 5000,
          createdAt: Date.now() - 10000
        }
        mockRedisGet.mockResolvedValue(existingChat)
      })

      it('should detect end when status becomes null (404/error)', async () => {
        const communityId = 'test-community-123'

        const result = await cache.updateAndDetectChange(communityId, null)

        expect(result.wasActive).toBe(true)
        expect(result.isNowActive).toBe(false)
        expect(result.justEnded).toBe(true)
      })
    })

    describe('when voice chat does not exist', () => {
      beforeEach(() => {
        mockRedisGet.mockResolvedValue(null)
      })

      it('should not detect end for non-existent voice chat', async () => {
        const result = await cache.updateAndDetectChange('non-existent', null)

        expect(result.wasActive).toBe(false)
        expect(result.isNowActive).toBe(false)
        expect(result.justEnded).toBe(false)
        expect(result.cachedChat).toBeNull()
      })
    })
  })

  describe('when performing cache cleanup', () => {
    describe('when there are old and recent entries', () => {
      beforeEach(() => {
        const now = Date.now()
        const oldTime = now - 25 * 60 * 60 * 1000 // 25 hours ago
        const keys = ['community-voice-chat:old-community', 'community-voice-chat:recent-community']

        const oldEntry = {
          communityId: 'old-community',
          isActive: false,
          lastChecked: oldTime,
          createdAt: now - 30 * 60 * 60 * 1000
        }

        const recentEntry = {
          communityId: 'recent-community',
          isActive: true,
          lastChecked: now - 1000,
          createdAt: now - 1000
        }

        mockRedisKeys.mockResolvedValue(keys)
        mockRedisGet.mockResolvedValueOnce(oldEntry).mockResolvedValueOnce(recentEntry)
        mockRedisDel.mockResolvedValue(1)
      })

      it('should remove old entries based on maxAge', async () => {
        await cache.cleanup(24 * 60 * 60 * 1000) // 24 hours

        expect(mockRedisDel).toHaveBeenCalledWith('community-voice-chat:old-community')
        expect(mockRedisDel).toHaveBeenCalledTimes(1)
      })
    })

    describe('when Redis throws an error during cleanup', () => {
      beforeEach(() => {
        mockRedisKeys.mockRejectedValue(new Error('Redis error'))
      })

      it('should handle Redis errors gracefully', async () => {
        await expect(cache.cleanup()).resolves.not.toThrow()
      })
    })
  })

  describe('when checking cache size', () => {
    describe('when cache has entries', () => {
      beforeEach(() => {
        const keys = ['community-voice-chat:1', 'community-voice-chat:2']
        mockRedisKeys.mockResolvedValue(keys)
      })

      it('should return correct cache size', async () => {
        const size = await cache.size()

        expect(size).toBe(2)
      })
    })

    describe('when Redis throws an error', () => {
      beforeEach(() => {
        mockRedisKeys.mockRejectedValue(new Error('Redis error'))
      })

      it('should handle Redis errors gracefully', async () => {
        const size = await cache.size()

        expect(size).toBe(0)
      })
    })
  })
})

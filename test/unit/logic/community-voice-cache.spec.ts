import { createCommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../src/types'

describe('Community Voice Chat Cache Component', () => {
  let cache: ReturnType<typeof createCommunityVoiceChatCacheComponent>
  let mockComponents: Pick<AppComponents, 'logs' | 'redis'>
  let mockRedisGet: jest.MockedFunction<any>
  let mockRedisPut: jest.MockedFunction<any>
  let mockRedisKeys: jest.MockedFunction<any>
  let mockRedisDel: jest.MockedFunction<any>

  // Fixed timestamps to avoid test flakiness
  const FIXED_NOW = 1640995200000 // Jan 1, 2022 00:00:00 UTC
  const FIXED_CREATED_AT = FIXED_NOW - 10000
  const FIXED_LAST_CHECKED = FIXED_NOW - 5000

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
    
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

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when setting community voice chat data', () => {
    describe('when adding a new active community voice chat', () => {
      beforeEach(() => {
        mockRedisPut.mockResolvedValue(undefined)
        mockRedisGet.mockResolvedValue(null)
      })

      it('should add a new community voice chat to cache', async () => {
        const communityId = 'test-community-123'
        const isActive = true

        await cache.setCommunityVoiceChat(communityId, isActive, FIXED_CREATED_AT)

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-123',
          expect.objectContaining({
            communityId,
            isActive: true,
            createdAt: FIXED_CREATED_AT,
            lastChecked: FIXED_NOW
          }),
          { EX: 24 * 60 * 60 }
        )
      })
    })

    describe('when setting community voice chat to inactive', () => {
      beforeEach(() => {
        mockRedisDel.mockResolvedValue(1)
      })

      it('should remove community voice chat from cache', async () => {
        const communityId = 'test-community-123'
        const isActive = false

        await cache.setCommunityVoiceChat(communityId, isActive)

        expect(mockRedisDel).toHaveBeenCalledWith('community-voice-chat:test-community-123')
        expect(mockRedisPut).not.toHaveBeenCalled()
      })
    })

    describe('when updating existing community voice chat', () => {
      const communityId = 'test-community-123'
      const existingChat = {
        communityId,
        isActive: true,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT
      }

      beforeEach(() => {
        mockRedisPut.mockResolvedValue(undefined)
        mockRedisGet.mockResolvedValue(existingChat)
      })

      it('should update existing community voice chat preserving createdAt', async () => {
        await cache.setCommunityVoiceChat(communityId, true)

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-123',
          expect.objectContaining({
            communityId,
            isActive: true,
            createdAt: FIXED_CREATED_AT // Should preserve original
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
      const communityId = 'test-community-123'
      const cachedChat = {
        communityId,
        isActive: true,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT
      }

      beforeEach(() => {
        mockRedisGet.mockResolvedValue(cachedChat)
      })

      it('should return cached community voice chat data', async () => {
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
      const activeChat1 = { communityId: 'active-1', isActive: true, lastChecked: FIXED_LAST_CHECKED, createdAt: FIXED_CREATED_AT }
      const inactiveChat = { communityId: 'inactive-1', isActive: false, lastChecked: FIXED_LAST_CHECKED, createdAt: FIXED_CREATED_AT }
      const activeChat2 = { communityId: 'active-2', isActive: true, lastChecked: FIXED_LAST_CHECKED, createdAt: FIXED_CREATED_AT }

      beforeEach(() => {
        const keys = ['community-voice-chat:active-1', 'community-voice-chat:inactive-1', 'community-voice-chat:active-2']
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
          lastChecked: FIXED_LAST_CHECKED,
          createdAt: FIXED_CREATED_AT
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
      const communityId = 'test-community-123'
      const existingChat = {
        communityId,
        isActive: true,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT
      }

      beforeEach(() => {
        mockRedisGet.mockResolvedValue(existingChat)
        mockRedisDel.mockResolvedValue(1)
      })

      it('should detect when voice chat ends (active to inactive)', async () => {
        const justEnded = await cache.updateAndDetectChange(communityId, false)

        expect(justEnded).toBe(true)
        expect(mockRedisDel).toHaveBeenCalledWith('community-voice-chat:test-community-123')
      })
    })

    describe('when voice chat starts (inactive to active)', () => {
      const communityId = 'test-community-123'
      const existingChat = {
        communityId,
        isActive: false,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT
      }

      beforeEach(() => {
        mockRedisGet.mockResolvedValue(existingChat)
        mockRedisPut.mockResolvedValue(undefined)
      })

      it('should not detect end when voice chat starts (inactive to active)', async () => {
        const justEnded = await cache.updateAndDetectChange(communityId, true)

        expect(justEnded).toBe(false)
      })
    })

    describe('when status becomes null (404/error)', () => {
      const communityId = 'test-community-123'
      const existingChat = {
        communityId,
        isActive: true,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT
      }

      beforeEach(() => {
        mockRedisGet.mockResolvedValue(existingChat)
        mockRedisDel.mockResolvedValue(1)
      })

      it('should detect end when status becomes null (404/error)', async () => {
        const justEnded = await cache.updateAndDetectChange(communityId, null)

        expect(justEnded).toBe(true)
      })
    })

    describe('when voice chat does not exist', () => {
      beforeEach(() => {
        mockRedisGet.mockResolvedValue(null)
      })

      it('should not detect end for non-existent voice chat', async () => {
        const justEnded = await cache.updateAndDetectChange('non-existent', null)

        expect(justEnded).toBe(false)
      })
    })
  })
})

import { createCommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../src/types'

describe('Community Voice Chat Cache Component', () => {
  let cache: ReturnType<typeof createCommunityVoiceChatCacheComponent>
  let mockComponents: Pick<AppComponents, 'logs' | 'redis'>
  let mockRedisPut: jest.MockedFunction<any>
  let mockRedisGet: jest.MockedFunction<any>
  let mockRedisEval: jest.MockedFunction<any>
  let mockRedisSet: jest.MockedFunction<any>

  // Fixed timestamps to avoid test flakiness
  const FIXED_NOW = 1640995200000 // Jan 1, 2022 00:00:00 UTC
  const FIXED_CREATED_AT = FIXED_NOW - 10000
  const CACHE_TTL = 7 * 24 * 60 * 60
  const communityId = 'test-community-123'
  const cacheKey = 'community-voice-chat:test-community-123'

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)

    mockRedisPut = jest.fn()
    mockRedisGet = jest.fn()
    mockRedisEval = jest.fn()
    mockRedisSet = jest.fn()

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
        client: {
          eval: mockRedisEval,
          set: mockRedisSet
        }
      }
    } as any

    cache = createCommunityVoiceChatCacheComponent(mockComponents)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when setting community voice chat data', () => {
    beforeEach(() => {
      mockRedisPut.mockResolvedValue(undefined)
    })

    it('should add the community voice chat to the cache for a week', async () => {
      await cache.setCommunityVoiceChat(communityId, FIXED_CREATED_AT, 'members')

      expect(mockRedisPut).toHaveBeenCalledWith(
        cacheKey,
        { communityId, createdAt: FIXED_CREATED_AT, notificationScope: 'members' },
        { EX: CACHE_TTL }
      )
    })

    it('should use current time as default for createdAt', async () => {
      await cache.setCommunityVoiceChat(communityId)

      expect(mockRedisPut).toHaveBeenCalledWith(
        cacheKey,
        expect.objectContaining({ communityId, createdAt: FIXED_NOW }),
        { EX: CACHE_TTL }
      )
    })

    it('should overwrite whatever was cached for the community', async () => {
      await cache.setCommunityVoiceChat(communityId, FIXED_NOW + 10000, 'all')

      expect(mockRedisPut).toHaveBeenCalledWith(
        cacheKey,
        expect.objectContaining({ createdAt: FIXED_NOW + 10000, notificationScope: 'all' }),
        { EX: CACHE_TTL }
      )
    })
  })

  describe('when retrieving community voice chat data', () => {
    describe('when a community voice chat is cached', () => {
      const cachedChat = { communityId, createdAt: FIXED_CREATED_AT, notificationScope: 'all' as const }

      beforeEach(() => {
        mockRedisGet.mockResolvedValue(cachedChat)
      })

      it('should return the cached community voice chat', async () => {
        const result = await cache.getCommunityVoiceChat(communityId)

        expect(result).toEqual(cachedChat)
        expect(mockRedisGet).toHaveBeenCalledWith(cacheKey)
      })
    })

    describe('when nothing is cached for the community', () => {
      beforeEach(() => {
        mockRedisGet.mockResolvedValue(null)
      })

      it('should return null', async () => {
        const result = await cache.getCommunityVoiceChat('non-existent')

        expect(result).toBeNull()
      })
    })
  })

  describe('when taking community voice chat data', () => {
    const cachedChat = {
      communityId,
      createdAt: FIXED_CREATED_AT,
      notificationScope: 'members' as const
    }

    describe('when a community voice chat is cached', () => {
      beforeEach(() => {
        mockRedisEval.mockResolvedValue([1, JSON.stringify(cachedChat)])
      })

      it('should return the cached community voice chat', async () => {
        const result = await cache.takeCommunityVoiceChat(communityId, FIXED_NOW)

        expect(result).toEqual(cachedChat)
      })

      it('should read, compare and delete it in a single server-side step bounded by the end time', async () => {
        await cache.takeCommunityVoiceChat(communityId, FIXED_NOW)

        expect(mockRedisEval).toHaveBeenCalledWith(expect.stringContaining("redis.call('DEL', KEYS[1])"), {
          keys: [cacheKey],
          arguments: [FIXED_NOW.toString()]
        })
      })

      it('should take it unconditionally when no end time is given', async () => {
        await cache.takeCommunityVoiceChat(communityId)

        expect(mockRedisEval).toHaveBeenCalledWith(expect.any(String), { keys: [cacheKey], arguments: [''] })
      })
    })

    describe('when the cached community voice chat started after the given end', () => {
      beforeEach(() => {
        mockRedisEval.mockResolvedValue([0, JSON.stringify(cachedChat)])
      })

      it('should return null', async () => {
        const result = await cache.takeCommunityVoiceChat(communityId, FIXED_CREATED_AT - 1)

        expect(result).toBeNull()
      })
    })

    describe('when nothing is cached for the community', () => {
      beforeEach(() => {
        mockRedisEval.mockResolvedValue(null)
      })

      it('should return null', async () => {
        const result = await cache.takeCommunityVoiceChat('non-existent', FIXED_NOW)

        expect(result).toBeNull()
      })
    })

    describe('when Redis throws an error', () => {
      beforeEach(() => {
        mockRedisEval.mockRejectedValue(new Error('Redis error'))
      })

      it('should throw so a failure is told apart from an absent entry', async () => {
        await expect(cache.takeCommunityVoiceChat(communityId, FIXED_NOW)).rejects.toThrow('Redis error')
      })
    })
  })

  describe('when restoring community voice chat data', () => {
    const cachedChat = {
      communityId,
      createdAt: FIXED_CREATED_AT,
      notificationScope: 'all' as const
    }

    describe('when nothing is cached for the community', () => {
      beforeEach(() => {
        mockRedisSet.mockResolvedValue('OK')
      })

      it('should put the entry back only if the key is still free and report it', async () => {
        const restored = await cache.restoreCommunityVoiceChat(cachedChat)

        expect(restored).toBe(true)
        expect(mockRedisSet).toHaveBeenCalledWith(cacheKey, JSON.stringify(cachedChat), { NX: true, EX: CACHE_TTL })
      })
    })

    describe('when a room is already cached for the community', () => {
      beforeEach(() => {
        mockRedisSet.mockResolvedValue(null)
      })

      it('should keep the cached room and report the entry was not put back', async () => {
        const restored = await cache.restoreCommunityVoiceChat(cachedChat)

        expect(restored).toBe(false)
      })
    })
  })
})

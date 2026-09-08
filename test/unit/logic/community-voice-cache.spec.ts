import { createCommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../src/types'

describe('Community Voice Chat Cache Component', () => {
  let cache: ReturnType<typeof createCommunityVoiceChatCacheComponent>
  let mockComponents: Pick<AppComponents, 'logs' | 'redis'>
  let mockRedisGet: jest.MockedFunction<any>
  let mockRedisPut: jest.MockedFunction<any>
  let mockRedisDel: jest.MockedFunction<any>

  // Fixed timestamps to avoid test flakiness
  const FIXED_NOW = 1640995200000 // Jan 1, 2022 00:00:00 UTC
  const FIXED_CREATED_AT = FIXED_NOW - 10000
  const FIXED_LAST_CHECKED = FIXED_NOW - 5000

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)

    mockRedisGet = jest.fn()
    mockRedisPut = jest.fn()
    mockRedisDel = jest.fn()

    const mockRedisClient = {
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

        await cache.setCommunityVoiceChat(communityId, FIXED_CREATED_AT)

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

      it('should use current time as default for createdAt', async () => {
        const communityId = 'test-community-456'

        await cache.setCommunityVoiceChat(communityId)

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-456',
          expect.objectContaining({
            communityId,
            isActive: true,
            createdAt: FIXED_NOW, // Should use current time as default
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

      it('should remove community voice chat from cache using removeCommunityVoiceChat', async () => {
        const communityId = 'test-community-123'

        await cache.removeCommunityVoiceChat(communityId)

        expect(mockRedisDel).toHaveBeenCalledWith('community-voice-chat:test-community-123')
        expect(mockRedisPut).not.toHaveBeenCalled()
      })
    })

    describe('when a stale entry is still cached for the community', () => {
      const communityId = 'test-community-123'
      const existingChat = {
        communityId,
        isActive: true,
        lastChecked: FIXED_LAST_CHECKED,
        createdAt: FIXED_CREATED_AT,
        notificationScope: 'all' as const
      }
      let newRoomCreatedAt: number

      beforeEach(() => {
        newRoomCreatedAt = FIXED_NOW + 10000
        mockRedisPut.mockResolvedValue(undefined)
        mockRedisGet.mockResolvedValue(existingChat)
      })

      it('should replace the stale room metadata with the new room one', async () => {
        await cache.setCommunityVoiceChat(communityId, newRoomCreatedAt, 'members')

        expect(mockRedisPut).toHaveBeenCalledWith(
          'community-voice-chat:test-community-123',
          expect.objectContaining({
            communityId,
            createdAt: newRoomCreatedAt,
            notificationScope: 'members'
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
})

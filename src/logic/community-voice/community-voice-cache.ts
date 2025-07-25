import { isErrorWithMessage } from '../../utils/errors'
import { AppComponents } from '../../types'

/**
 * Represents an active community voice chat in the cache
 */
export interface CachedCommunityVoiceChat {
  communityId: string
  isActive: boolean
  lastChecked: number
  createdAt: number
}

/**
 * Interface for the community voice chat cache component
 */
export interface ICommunityVoiceChatCacheComponent {
  /**
   * Adds or updates a community voice chat in the cache as active
   * @param communityId - The community ID
   * @param createdAt - When the voice chat was created (optional, defaults to now)
   */
  setCommunityVoiceChat(communityId: string, createdAt?: number): Promise<void>

  /**
   * Gets a community voice chat from the cache
   * @param communityId - The community ID
   * @returns The cached voice chat or null if not found
   */
  getCommunityVoiceChat(communityId: string): Promise<CachedCommunityVoiceChat | null>

  /**
   * Removes a community voice chat from the cache
   * @param communityId - The community ID
   */
  removeCommunityVoiceChat(communityId: string): Promise<void>

  /**
   * Gets all active community voice chats in the cache
   * @returns Array of active community voice chats
   */
  getActiveCommunityVoiceChats(): Promise<CachedCommunityVoiceChat[]>

  /**
   * Updates the status of a community voice chat and detects if it changed from active to inactive
   * @param communityId - The community ID
   * @param isActive - The new active status (null means not found/error)
   * @returns Whether the voice chat just ended
   */
  updateAndDetectChange(communityId: string, isActive: boolean | null): Promise<boolean>
}

/**
 * Creates a community voice chat cache component using Redis
 */
export function createCommunityVoiceChatCacheComponent({
  logs,
  redis
}: Pick<AppComponents, 'logs' | 'redis'>): ICommunityVoiceChatCacheComponent {
  const logger = logs.getLogger('community-voice-chat-cache')

  const CACHE_PREFIX = 'community-voice-chat:'
  const CACHE_TTL = 24 * 60 * 60 // 24 hours in seconds

  function getCacheKey(communityId: string): string {
    return `${CACHE_PREFIX}${communityId}`
  }

  async function setCommunityVoiceChat(communityId: string, createdAt: number = Date.now()): Promise<void> {
    const now = Date.now()
    const existing = await getCommunityVoiceChat(communityId)

    const cachedChat: CachedCommunityVoiceChat = {
      communityId,
      isActive: true, // Always true for active chats
      lastChecked: now,
      createdAt: existing?.createdAt ?? createdAt
    }

    await redis.put(getCacheKey(communityId), cachedChat, { EX: CACHE_TTL })

    logger.debug(`Updated cache for community ${communityId}`, {
      createdAt: createdAt.toString()
    })
  }

  async function getCommunityVoiceChat(communityId: string): Promise<CachedCommunityVoiceChat | null> {
    try {
      return await redis.get<CachedCommunityVoiceChat>(getCacheKey(communityId))
    } catch (error) {
      logger.warn(`Error getting community voice chat ${communityId} from cache`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      return null
    }
  }

  async function removeCommunityVoiceChat(communityId: string): Promise<void> {
    try {
      await redis.client.del(getCacheKey(communityId))
      logger.debug(`Removed community voice chat ${communityId} from cache`)
    } catch (error) {
      logger.warn(`Error removing community voice chat ${communityId} from cache`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  async function getActiveCommunityVoiceChats(): Promise<CachedCommunityVoiceChat[]> {
    try {
      const keys = await redis.client.keys(`${CACHE_PREFIX}*`)
      if (keys.length === 0) {
        return []
      }

      const chats = await Promise.all(
        keys.map(async (key) => {
          try {
            const chat = await redis.get<CachedCommunityVoiceChat>(key)
            return chat?.isActive ? chat : null
          } catch (error) {
            logger.warn(`Error getting cached chat for key ${key}`, {
              error: isErrorWithMessage(error) ? error.message : 'Unknown error'
            })
            return null
          }
        })
      )

      return chats.filter((chat): chat is CachedCommunityVoiceChat => chat !== null)
    } catch (error) {
      logger.error(`Error getting active community voice chats from cache`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      return []
    }
  }

  async function updateAndDetectChange(communityId: string, isActive: boolean | null): Promise<boolean> {
    const existing = await getCommunityVoiceChat(communityId)
    const wasActive = existing?.isActive ?? false
    const isNowActive = isActive ?? false
    const justEnded = wasActive && !isNowActive

    logger.info(`Updating community voice chat ${communityId}`, {
      isActive: isActive ? 'true' : 'false'
    })

    if (isActive === true) {
      // Update the cache as active
      await setCommunityVoiceChat(communityId, existing?.createdAt)
    } else if (isActive === false || (isActive === null && existing && wasActive)) {
      // Remove from cache when inactive or when we got null but it was active
      await removeCommunityVoiceChat(communityId)
    }

    if (justEnded) {
      logger.info(`Detected community voice chat ended for community ${communityId}`, {
        wasActive: wasActive.toString(),
        isNowActive: isNowActive.toString()
      })
    }

    return justEnded
  }

  return {
    setCommunityVoiceChat,
    getCommunityVoiceChat,
    removeCommunityVoiceChat,
    getActiveCommunityVoiceChats,
    updateAndDetectChange
  }
}

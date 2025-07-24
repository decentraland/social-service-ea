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
   * Adds or updates a community voice chat in the cache
   * @param communityId - The community ID
   * @param isActive - Whether the voice chat is active
   * @param createdAt - When the voice chat was created (optional, defaults to now)
   */
  setCommunityVoiceChat(communityId: string, isActive: boolean, createdAt?: number): Promise<void>

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

  async function setCommunityVoiceChat(
    communityId: string,
    isActive: boolean,
    createdAt: number = Date.now()
  ): Promise<void> {
    if (!isActive) {
      // Remove inactive communities from cache instead of storing them
      await removeCommunityVoiceChat(communityId)
      return
    }

    const now = Date.now()
    const existing = await getCommunityVoiceChat(communityId)

    const cachedChat: CachedCommunityVoiceChat = {
      communityId,
      isActive,
      lastChecked: now,
      createdAt: existing?.createdAt ?? createdAt
    }

    await redis.put(getCacheKey(communityId), cachedChat, { EX: CACHE_TTL })

    logger.debug(`Updated cache for community ${communityId}`, {
      isActive: isActive.toString(),
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
      const activeChats: CachedCommunityVoiceChat[] = []

      for (const key of keys) {
        const communityId = key.replace(CACHE_PREFIX, '')
        const chat = await getCommunityVoiceChat(communityId)
        if (chat && chat.isActive) {
          activeChats.push(chat)
        }
      }

      return activeChats
    } catch (error) {
      logger.error('Error getting active community voice chats', {
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

    if (isActive !== null) {
      // Update the cache with new status
      await setCommunityVoiceChat(communityId, isActive, existing?.createdAt)
    } else if (existing && wasActive) {
      // Status is null (404 or error), but we had it as active - mark as ended
      await setCommunityVoiceChat(communityId, false, existing.createdAt)
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

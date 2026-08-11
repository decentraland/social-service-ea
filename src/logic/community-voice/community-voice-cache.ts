import { isErrorWithMessage } from '../../utils/errors'
import { AppComponents, CommunityVoiceChatNotificationScope } from '../../types'

/**
 * Represents an active community voice chat in the cache
 */
export interface CachedCommunityVoiceChat {
  communityId: string
  isActive: boolean
  lastChecked: number
  createdAt: number
  /** Who the room was announced to at start; absent for rooms cached before this was recorded. */
  notificationScope?: CommunityVoiceChatNotificationScope
}

/**
 * Interface for the community voice chat cache component
 *
 * Records the rooms this service announced. comms-gatekeeper owns the room lifecycle and reports
 * the end of one over the queue; this cache holds what that report does not carry — who the start
 * was announced to — and its entry doubles as the token that keeps a redelivered end silent.
 */

export interface ICommunityVoiceChatCacheComponent {
  /**
   * Adds or updates a community voice chat in the cache as active
   * @param communityId - The community ID
   * @param createdAt - When the voice chat was created (optional, defaults to now)
   * @param notificationScope - Who the room start was announced to
   */
  setCommunityVoiceChat(
    communityId: string,
    createdAt?: number,
    notificationScope?: CommunityVoiceChatNotificationScope
  ): Promise<void>

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
    createdAt: number = Date.now(),
    notificationScope?: CommunityVoiceChatNotificationScope
  ): Promise<void> {
    const now = Date.now()

    const cachedChat: CachedCommunityVoiceChat = {
      communityId,
      isActive: true, // Always true for active chats
      lastChecked: now,
      createdAt,
      notificationScope
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

  return {
    setCommunityVoiceChat,
    getCommunityVoiceChat,
    removeCommunityVoiceChat
  }
}

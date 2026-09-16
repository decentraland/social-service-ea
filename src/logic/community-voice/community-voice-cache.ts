import { AppComponents, CommunityVoiceChatNotificationScope } from '../../types'

/**
 * Represents an active community voice chat in the cache
 */
export interface CachedCommunityVoiceChat {
  communityId: string
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
   * Atomically reads and removes a community voice chat from the cache, so that of several
   * concurrent callers exactly one gets it
   * @param communityId - The community ID
   * @param endedAt - When given, only a room created at or before this time is taken, so the end of
   * an earlier room cannot remove the entry of the one that replaced it
   * @returns The cached voice chat, or null if nothing was cached or the cached room is newer
   * @throws When the cache cannot be reached, so a failure is told apart from an absent entry
   */
  takeCommunityVoiceChat(communityId: string, endedAt?: number): Promise<CachedCommunityVoiceChat | null>

  /**
   * Puts a taken community voice chat back, unless something is cached for the community by now:
   * a room started in the meantime keeps its own entry
   * @param cachedChat - The entry to put back
   * @returns Whether the entry was put back
   */
  restoreCommunityVoiceChat(cachedChat: CachedCommunityVoiceChat): Promise<boolean>
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
  // Long enough to outlive any room. Every end path removes the entry and a start overwrites it,
  // so a stale one left behind by a lost event is harmless.
  const CACHE_TTL = 7 * 24 * 60 * 60 // 7 days in seconds
  // Read, compare and delete server-side so no write can slip in between the three.
  const TAKE_SCRIPT = [
    "local chat = redis.call('GET', KEYS[1])",
    'if not chat then return nil end',
    'local endedAt = tonumber(ARGV[1])',
    'if endedAt ~= nil and cjson.decode(chat).createdAt > endedAt then return {0, chat} end',
    "redis.call('DEL', KEYS[1])",
    'return {1, chat}'
  ].join('; ')

  function getCacheKey(communityId: string): string {
    return `${CACHE_PREFIX}${communityId}`
  }

  async function setCommunityVoiceChat(
    communityId: string,
    createdAt: number = Date.now(),
    notificationScope?: CommunityVoiceChatNotificationScope
  ): Promise<void> {
    const cachedChat: CachedCommunityVoiceChat = {
      communityId,
      createdAt,
      notificationScope
    }

    await redis.put(getCacheKey(communityId), cachedChat, { EX: CACHE_TTL })

    logger.debug(`Updated cache for community ${communityId}`, {
      createdAt: createdAt.toString()
    })
  }

  async function takeCommunityVoiceChat(
    communityId: string,
    endedAt?: number
  ): Promise<CachedCommunityVoiceChat | null> {
    const reply = (await redis.client.eval(TAKE_SCRIPT, {
      keys: [getCacheKey(communityId)],
      arguments: [endedAt?.toString() ?? '']
    })) as [number, string] | null

    if (!reply) {
      return null
    }

    const [taken, serializedChat] = reply
    const cachedChat = JSON.parse(serializedChat) as CachedCommunityVoiceChat

    if (taken !== 1) {
      logger.info(`Kept the cached community voice chat for community ${communityId}: it started after the end`, {
        createdAt: cachedChat.createdAt,
        endedAt: endedAt ?? 0
      })
      return null
    }

    return cachedChat
  }

  async function restoreCommunityVoiceChat(cachedChat: CachedCommunityVoiceChat): Promise<boolean> {
    const result = await redis.client.set(getCacheKey(cachedChat.communityId), JSON.stringify(cachedChat), {
      NX: true,
      EX: CACHE_TTL
    })
    return result === 'OK'
  }

  return {
    setCommunityVoiceChat,
    takeCommunityVoiceChat,
    restoreCommunityVoiceChat
  }
}

import { Event, Events, CommunityStreamingEndedEvent } from '@dcl/schemas'
import { CommunityVoiceChatStatus as ProtocolCommunityVoiceChatStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../adapters/pubsub'
import { ICommunityVoiceChatCacheComponent } from '../../../logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../types/system'
import { sleep } from '../../../utils/timer'
import { EventHandler } from './types'

const PUBLISH_ATTEMPTS = 3
const PUBLISH_RETRY_DELAY_MS = 250

/**
 * Propagates a community voice chat teardown reported by comms-gatekeeper to the subscribed clients.
 *
 * comms-gatekeeper owns the room lifecycle and ends a room from four places (the last moderator
 * leaving, LiveKit deleting the room, the expiration sweep, and an explicit end). All four publish
 * this event, which is what lets this service report the end as it happens instead of sampling the
 * gatekeeper's status on a timer.
 *
 * The cache entry is the idempotency token: the update is published only by the call that takes
 * it, so redeliveries of the same at-least-once message and concurrent consumers are silent.
 */
export function createCommunityVoiceChatEndedHandler({
  logs,
  pubsub,
  communityVoiceChatCache
}: Pick<AppComponents, 'logs' | 'pubsub'> & {
  communityVoiceChatCache: ICommunityVoiceChatCacheComponent
}): EventHandler {
  const logger = logs.getLogger('community-voice-chat-ended-handler')

  return {
    type: Events.Type.STREAMING,
    subTypes: [Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED],
    handle: async (message: Event) => {
      const { metadata, timestamp } = message as CommunityStreamingEndedEvent
      const { communityId } = metadata

      if (!communityId) {
        logger.warn('Received a community voice chat ended event without a community id, skipping it')
        return
      }

      // Take the entry in one atomic step, and only if the cached room started before this end: a
      // community can open a new room right after the previous one ended, and a late or redelivered
      // event for the old room must not tear the new one down. Of several consumers handling the
      // same end, only the one that gets the entry announces it. A cache failure throws, so it is
      // logged as a failed message rather than as nothing to end.
      const endedChat = await communityVoiceChatCache.takeCommunityVoiceChat(communityId, timestamp || undefined)

      if (!endedChat) {
        logger.debug(`Nothing to end for community ${communityId}: no room is cached or the cached one is newer`)
        return
      }

      const endedAt = Date.now()
      const update = {
        communityId,
        status: ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED,
        endedAt,
        // An ended update carries no community details: the client already has the context.
        positions: [],
        worlds: [],
        communityName: '',
        communityImage: undefined,
        // Preserve the start-time fanout class for best-effort cleanup by the update handler.
        notificationScope: endedChat.notificationScope
      }

      let published = false
      for (let attempt = 1; attempt <= PUBLISH_ATTEMPTS && !published; attempt++) {
        if (attempt > 1) {
          await sleep(PUBLISH_RETRY_DELAY_MS)
        }
        published = await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, update)
      }

      if (!published) {
        // Put the entry back unless a newer room already replaced it. The consumer drops the message
        // either way, so this only helps a redelivery after a crash; otherwise the entry ages out and
        // clients recover by listing the active voice chats.
        logger.error(`Failed to publish the ended update for community ${communityId}, keeping the room cached`)
        await communityVoiceChatCache.restoreCommunityVoiceChat(endedChat)
        return
      }

      logger.info(`Community voice chat ended for community ${communityId}`, {
        communityId,
        startedAt: endedChat.createdAt,
        endedAt,
        duration: endedAt - endedChat.createdAt
      })
    }
  }
}

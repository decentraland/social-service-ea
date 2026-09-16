import { Event, Events, CommunityStreamingEndedEvent } from '@dcl/schemas'
import { CommunityVoiceChatStatus as ProtocolCommunityVoiceChatStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../adapters/pubsub'
import { ICommunityVoiceChatCacheComponent } from '../../../logic/community-voice/community-voice-cache'
import { AppComponents } from '../../../types/system'
import { errorMessageOrDefault } from '../../../utils/errors'
import { EventHandler } from './types'

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

      const cachedChat = await communityVoiceChatCache.getCommunityVoiceChat(communityId)

      if (!cachedChat) {
        logger.debug(`No active community voice chat cached for community ${communityId}, nothing to end`)
        return
      }

      // A community can open a new room right after the previous one ended. Without this guard a
      // late or redelivered event for the old room would tear the new one down for every client.
      if (timestamp && cachedChat.createdAt > timestamp) {
        logger.info(`Ignoring a community voice chat ended event older than the cached room`, {
          communityId,
          eventTimestamp: timestamp,
          roomCreatedAt: cachedChat.createdAt
        })
        return
      }

      // Take the entry atomically: of several consumers handling the same end, only the one that
      // gets it announces.
      const endedChat = await communityVoiceChatCache.takeCommunityVoiceChat(communityId)

      if (!endedChat) {
        logger.debug(`The end of the community voice chat for community ${communityId} was already announced`)
        return
      }

      const endedAt = Date.now()

      try {
        await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
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
        })
      } catch (error) {
        // The consumer deletes the message whatever happens here, so there is nothing to retry.
        logger.error(`Failed to publish the ended update for community ${communityId}`, {
          error: errorMessageOrDefault(error)
        })
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

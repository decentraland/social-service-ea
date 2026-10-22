import { AppComponents } from '../../../types/system'
import { createCommunityStreamingEndedHandler } from './community-streaming-ended-handler'
import { createCommunityVoiceChatEndedHandler } from './community-voice-chat-ended-handler'
import { createEventEndedHandler } from './event-ended-handler'
import { createLoggedInHandler } from './logged-in-handler'
import { createPhotoTakenHandler } from './photo-taken-handler'

export function createSqsHandlers(
  components: Pick<
    AppComponents,
    'logs' | 'referral' | 'communitiesDb' | 'queueProcessor' | 'pubsub' | 'communityVoiceChatCache'
  >
): void {
  const { queueProcessor } = components

  const handlers = [
    createLoggedInHandler(components),
    createEventEndedHandler(components),
    createCommunityStreamingEndedHandler(components),
    createCommunityVoiceChatEndedHandler(components),
    createPhotoTakenHandler(components)
  ]

  for (const handler of handlers) {
    for (const subType of handler.subTypes) {
      queueProcessor.addMessageHandler(handler.type, subType, handler.handle)
    }
  }
}

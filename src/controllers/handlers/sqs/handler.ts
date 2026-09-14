import { AppComponents } from '../../../types/system'
import { createCommunityStreamingEndedHandler } from './community-streaming-ended-handler'
import { createEventEndedHandler } from './event-ended-handler'
import { createLoggedInHandler } from './logged-in-handler'
import { createPhotoTakenHandler } from './photo-taken-handler'

export function createSqsHandlers(
  components: Pick<AppComponents, 'logs' | 'referral' | 'communitiesDb' | 'queueProcessor'>
): void {
  const { queueProcessor } = components

  const handlers = [
    createLoggedInHandler(components),
    createEventEndedHandler(components),
    createCommunityStreamingEndedHandler(components),
    createPhotoTakenHandler(components)
  ]

  for (const handler of handlers) {
    for (const subType of handler.subTypes) {
      queueProcessor.addMessageHandler(handler.type, subType, handler.handle)
    }
  }
}

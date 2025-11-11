import { Event } from '@dcl/schemas'

import { AppComponents } from '../../types/system'
import { IMessageProcessorComponent, EventHandler } from './types'
import { createLoggedInHandler } from './handlers/logged-in-handler'
import { createEventEndedHandler } from './handlers/event-ended-handler'
import { createCommunityStreamingEndedHandler } from './handlers/community-streaming-ended-handler'
import { createPhotoTakenHandler } from './handlers/photo-taken-handler'

export async function createMessageProcessorComponent({
  logs,
  referral,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'referral' | 'communitiesDb'>): Promise<IMessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  const eventHandlers: EventHandler[] = [
    createLoggedInHandler({ logs, referral }),
    createEventEndedHandler({ logs, communitiesDb }),
    createCommunityStreamingEndedHandler({ logs, communitiesDb }),
    createPhotoTakenHandler({ logs, communitiesDb })
  ]

  async function processMessage(message: Event) {
    const matchingHandlers = eventHandlers.filter(
      (handler) => message.type === handler.type && handler.subTypes.includes(message.subType)
    )

    if (matchingHandlers.length === 0) {
      logger.warn('No handler found for message', { message: JSON.stringify(message) })
      return
    }

    for (const handler of matchingHandlers) {
      try {
        await handler.handle(message)
      } catch (error) {
        logger.error('Error processing message in handler', {
          type: message.type,
          subType: message.subType,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  return {
    processMessage,
    registerHandler: (handler: EventHandler) => {
      eventHandlers.push(handler)
    }
  }
}

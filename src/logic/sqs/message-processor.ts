import { Event, Events, LoggedInEvent, LoggedInCachedEvent } from '@dcl/schemas'

import { AppComponents } from '../../types/system'
import { IMessageProcessorComponent, EventHandler } from './types'

export async function createMessageProcessorComponent({
  logs,
  referral
}: Pick<AppComponents, 'logs' | 'referral'>): Promise<IMessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  // TODO: decouple the handlers from the message processor
  const eventHandlers: EventHandler[] = [
    {
      type: Events.Type.CLIENT,
      subTypes: [Events.SubType.Client.LOGGED_IN, Events.SubType.Client.LOGGED_IN_CACHED],
      handle: async (message: Event) => {
        const { metadata } = message as LoggedInEvent | LoggedInCachedEvent
        const userAddress = metadata.userAddress

        if (!userAddress) {
          logger.error('User address not found in message', { message: JSON.stringify(message) })
          return
        }

        await referral.finalizeReferral(userAddress)
      }
    }
  ]

  async function processMessage(message: Event) {
    const handler = eventHandlers.find(
      (handler) => message.type === handler.type && handler.subTypes.includes(message.subType)
    )

    if (!handler) {
      logger.warn('No handler found for message', { message: JSON.stringify(message) })
      return
    }

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

  return {
    processMessage,
    registerHandler: (handler: EventHandler) => {
      eventHandlers.push(handler)
    }
  }
}

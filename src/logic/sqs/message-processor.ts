import { Event, Events, LoggedInEvent, LoggedInCachedEvent } from '@dcl/schemas'

import { AppComponents } from '../../types/system'
import { IMessageProcessorComponent, EventHandler } from './types'

export async function createMessageProcessorComponent({
  logs,
  referral
}: Pick<AppComponents, 'logs' | 'referral'>): Promise<IMessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  // Register event handlers
  const eventHandlers: EventHandler[] = [
    {
      type: Events.Type.CLIENT,
      subTypes: [
        Events.SubType.Client.LOGGED_IN,
        Events.SubType.Client.LOGGED_IN_CACHED
      ] as (typeof Events.SubType.Client)[keyof typeof Events.SubType.Client][],
      handler: async (message: Event) => {
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
    // Find and execute matching handlers
    for (const handler of eventHandlers) {
      if (message.type === handler.type && handler.subTypes.includes(message.subType)) {
        try {
          await handler.handler(message)
        } catch (error) {
          logger.error('Error processing message in handler', {
            type: message.type,
            subType: message.subType,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
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

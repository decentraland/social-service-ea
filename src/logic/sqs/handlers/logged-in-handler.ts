import { Event, Events, LoggedInEvent, LoggedInCachedEvent } from '@dcl/schemas'

import { AppComponents } from '../../../types/system'
import { EventHandler } from '../types'

export function createLoggedInHandler({
  logs,
  referral
}: Pick<AppComponents, 'logs' | 'referral'>): EventHandler {
  const logger = logs.getLogger('logged-in-handler')

  return {
    type: Events.Type.CLIENT,
    subTypes: [Events.SubType.Client.LOGGED_IN, Events.SubType.Client.LOGGED_IN_CACHED],
    handle: async (message: Event) => {
      const { metadata } = message as LoggedInEvent | LoggedInCachedEvent
      const userAddress = metadata.userAddress

      if (!userAddress) {
        logger.error('User address not found in message', { message: JSON.stringify(message) })
        return
      }

      try {
        await referral.finalizeReferral(userAddress)
      } catch (error) {
        logger.error('Error finalizing referral', {
          userAddress,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        throw error
      }
    }
  }
}


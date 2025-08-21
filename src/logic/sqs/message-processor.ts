import { Event, Events, LoggedInEvent, LoggedInCachedEvent } from '@dcl/schemas'

import { AppComponents } from '../../types/system'
import { IMessageProcessorComponent } from './types'

export async function createMessageProcessorComponent({
  logs,
  referral
}: Pick<AppComponents, 'logs' | 'referral'>): Promise<IMessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  async function processMessage(message: Event) {
    if (
      message.type !== Events.Type.CLIENT ||
      (message.subType !== Events.SubType.Client.LOGGED_IN_CACHED &&
        message.subType !== Events.SubType.Client.LOGGED_IN)
    ) {
      return
    }

    const { metadata } = message as LoggedInEvent | LoggedInCachedEvent
    const userAddress = metadata.userAddress

    if (!userAddress) {
      logger.error('User address not found in message', { message: JSON.stringify(message) })
      return
    }

    await referral.finalizeReferral(userAddress)

    return
  }

  return {
    processMessage
  }
}

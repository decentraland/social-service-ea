import { Event, Events, UserJoinedRoomEvent } from '@dcl/schemas'

import { AppComponents } from '../../types/system'
import { IMessageProcessorComponent } from './types'

export async function createMessageProcessorComponent({
  logs,
  referral
}: Pick<AppComponents, 'logs' | 'referral'>): Promise<IMessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  async function processMessage(message: Event) {
    if (message.type !== Events.Type.COMMS || message.subType !== Events.SubType.Comms.USER_JOINED_ROOM) {
      return
    }

    const { metadata } = message as UserJoinedRoomEvent
    const userAddress = metadata.userAddress

    if (!userAddress) {
      logger.error('User address not found in message', { message: JSON.stringify(message) })
      return
    }

    // await referral.finalizeReferral(userAddress)

    return
  }

  return {
    processMessage
  }
}

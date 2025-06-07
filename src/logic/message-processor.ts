import { Event, Events, UserJoinedRoomEvent } from '@dcl/schemas'

import { AppComponents } from '../types/system'
import { IMessageProcessorComponent } from '../types/message-processor.type'
import { ReferralProgressStatus } from '../types/referral-db.type'

export async function createMessageProcessorComponent({
  logs,
  referralDb
}: Pick<AppComponents, 'logs' | 'referralDb'>): Promise<IMessageProcessorComponent> {
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

    const userProgress = await referralDb.findReferralProgress({
      invited_user: userAddress,
      status: ReferralProgressStatus.SIGNED_UP
    })

    if (userProgress.length === 0) {
      return
    }

    logger.info('Referral tier granted to referrer', {
      referrer: userProgress[0].referrer,
      invited_user: userProgress[0].invited_user,
      status: ReferralProgressStatus.TIER_GRANTED
    })

    await referralDb.updateReferralProgress(userProgress[0].invited_user, ReferralProgressStatus.TIER_GRANTED)

    return
  }

  return {
    processMessage
  }
}

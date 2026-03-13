import { Events, UserBanCreatedEvent, UserBanLiftedEvent, UserWarningCreatedEvent } from '@dcl/schemas'
import { IPublisherComponent } from '@dcl/sns-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { UserBan, UserWarning } from './types'
import { retry } from '../../utils/retrier'

export function createBanEvent(ban: UserBan): UserBanCreatedEvent {
  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_BAN_CREATED,
    key: ban.id,
    timestamp: Date.now(),
    metadata: {
      id: ban.id,
      bannedAddress: ban.bannedAddress,
      bannedBy: ban.bannedBy,
      reason: ban.reason,
      bannedAt: ban.bannedAt.getTime(),
      expiresAt: ban.expiresAt ? ban.expiresAt.getTime() : null,
      ...(ban.customMessage ? { customMessage: ban.customMessage } : {})
    }
  }
}

export function createBanLiftedEvent(ban: UserBan): UserBanLiftedEvent {
  if (!ban.liftedBy || !ban.liftedAt) {
    throw new Error(`Ban ${ban.id} is not lifted`)
  }

  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_BAN_LIFTED,
    key: ban.id,
    timestamp: Date.now(),
    metadata: {
      id: ban.id,
      bannedAddress: ban.bannedAddress,
      liftedBy: ban.liftedBy,
      liftedAt: ban.liftedAt.getTime()
    }
  }
}

export function createWarningEvent(warning: UserWarning): UserWarningCreatedEvent {
  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_WARNING_CREATED,
    key: warning.id,
    timestamp: Date.now(),
    metadata: {
      id: warning.id,
      warnedAddress: warning.warnedAddress,
      warnedBy: warning.warnedBy,
      reason: warning.reason,
      warnedAt: warning.warnedAt.getTime()
    }
  }
}

export async function publishModerationEvent(
  sns: IPublisherComponent,
  event: UserBanCreatedEvent | UserBanLiftedEvent | UserWarningCreatedEvent,
  logger: ILoggerComponent.ILogger
): Promise<void> {
  try {
    await retry(async () => {
      await sns.publishMessage(event)
    })
  } catch (error: any) {
    logger.error('Failed to publish moderation event', {
      error: error.message,
      subType: event.subType,
      key: event.key
    })
  }
}

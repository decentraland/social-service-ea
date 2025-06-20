import { Events, ReferralInvitedUsersAcceptedEvent, ReferralNewTierReachedEvent } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { FriendshipRequestEvent, FriendshipAcceptedEvent } from '@dcl/schemas'
import { getProfileHasClaimedName, getProfileName, getProfilePictureUrl } from '../profiles'
import { retry } from '../../utils/retrier'
import { Action } from '../../types/entities'
import {
  NotificationContext,
  NotificationFriendshipContext,
  NotificationReferralContext,
  NotificationEventConfigMap,
  NotificationAction,
  NotificationType,
  NotificationFriendshipInput,
  NotificationReferralInput
} from './types'

const actionTypeMap: Record<NotificationAction, NotificationType> = {
  [NotificationAction.FRIENDSHIP_REQUEST]: NotificationType.FRIENDSHIP,
  [NotificationAction.FRIENDSHIP_ACCEPT]: NotificationType.FRIENDSHIP,
  [NotificationAction.REFERRAL_INVITED_USERS_ACCEPTED]: NotificationType.REFERRAL,
  [NotificationAction.REFERRAL_NEW_TIER_REACHED]: NotificationType.REFERRAL
}

export const getNotificationType = (action: NotificationAction): NotificationType => {
  const type = actionTypeMap[action]
  if (!type) throw new Error(`Unknown notification action: ${action}`)
  return type
}

function buildFriendshipEvent(
  context: NotificationFriendshipContext,
  subType: string
): FriendshipRequestEvent | FriendshipAcceptedEvent {
  const { requestId, senderAddress, receiverAddress, senderProfile, receiverProfile, message } = context
  const type = Events.Type.SOCIAL_SERVICE
  const baseEvent = {
    key: requestId,
    type,
    subType,
    timestamp: Date.now(),
    metadata: {
      requestId,
      sender: {
        address: senderAddress,
        name: getProfileName(senderProfile),
        profileImageUrl: getProfilePictureUrl(senderProfile),
        hasClaimedName: getProfileHasClaimedName(senderProfile)
      },
      receiver: {
        address: receiverAddress,
        name: getProfileName(receiverProfile),
        profileImageUrl: getProfilePictureUrl(receiverProfile),
        hasClaimedName: getProfileHasClaimedName(receiverProfile)
      }
    }
  }
  if (message) {
    return {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        message
      }
    } as FriendshipRequestEvent | FriendshipAcceptedEvent
  }
  return baseEvent as FriendshipRequestEvent | FriendshipAcceptedEvent
}

function buildReferralEvent(
  context: NotificationReferralContext,
  subType: string
): ReferralInvitedUsersAcceptedEvent | ReferralNewTierReachedEvent {
  const { title, description, address, tier, url, image, invitedUserAddress, invitedUsers, rarity } = context
  const type = Events.Type.REFERRAL
  return {
    key: `${address}-${invitedUserAddress}-${Date.now()}`,
    type,
    subType,
    timestamp: Date.now(),
    metadata: {
      title,
      description,
      address,
      tier,
      url,
      image,
      invitedUserAddress,
      invitedUsers,
      rarity: rarity || null
    }
  } as ReferralInvitedUsersAcceptedEvent | ReferralNewTierReachedEvent
}

export const NOTIFICATION_EVENT_CONFIGS: NotificationEventConfigMap = {
  [NotificationAction.FRIENDSHIP_REQUEST]: {
    eventType: Events.Type.SOCIAL_SERVICE,
    eventSubType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
    build: (context) =>
      buildFriendshipEvent(context as NotificationFriendshipContext, Events.SubType.SocialService.FRIENDSHIP_REQUEST)
  },
  [NotificationAction.FRIENDSHIP_ACCEPT]: {
    eventType: Events.Type.SOCIAL_SERVICE,
    eventSubType: Events.SubType.SocialService.FRIENDSHIP_ACCEPTED,
    build: (context) =>
      buildFriendshipEvent(context as NotificationFriendshipContext, Events.SubType.SocialService.FRIENDSHIP_ACCEPTED)
  },
  [NotificationAction.REFERRAL_INVITED_USERS_ACCEPTED]: {
    eventType: Events.Type.REFERRAL,
    eventSubType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED,
    build: (context) =>
      buildReferralEvent(
        context as NotificationReferralContext,
        Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED
      )
  },
  [NotificationAction.REFERRAL_NEW_TIER_REACHED]: {
    eventType: Events.Type.REFERRAL,
    eventSubType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED,
    build: (context) =>
      buildReferralEvent(context as NotificationReferralContext, Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED)
  }
}

export const shouldNotifyAction = (action: Action): boolean => {
  try {
    const notificationAction = mapActionToNotificationAction(action)
    return shouldNotifyNotificationAction(notificationAction)
  } catch {
    return false
  }
}

export const shouldNotifyNotificationAction = (action: NotificationAction): boolean => {
  const validActions = [
    NotificationAction.FRIENDSHIP_REQUEST,
    NotificationAction.FRIENDSHIP_ACCEPT,
    NotificationAction.REFERRAL_INVITED_USERS_ACCEPTED,
    NotificationAction.REFERRAL_NEW_TIER_REACHED
  ]
  return validActions.includes(action)
}

// Sobrecarga para mantener compatibilidad con tests
export function shouldNotify(action: Action): boolean
export function shouldNotify(action: NotificationAction): boolean
export function shouldNotify(action: Action | NotificationAction): boolean {
  if (action === Action.REQUEST || action === Action.ACCEPT) {
    return shouldNotifyAction(action as Action)
  }
  return shouldNotifyNotificationAction(action as NotificationAction)
}

export const mapActionToNotificationAction = (action: Action): NotificationAction => {
  switch (action) {
    case Action.REQUEST:
      return NotificationAction.FRIENDSHIP_REQUEST
    case Action.ACCEPT:
      return NotificationAction.FRIENDSHIP_ACCEPT
    default:
      throw new Error(`Unsupported action for notifications: ${action}`)
  }
}

const getActionName = (action: NotificationAction): string => {
  switch (action) {
    case NotificationAction.FRIENDSHIP_REQUEST:
      return Action.REQUEST
    case NotificationAction.FRIENDSHIP_ACCEPT:
      return Action.ACCEPT
    default:
      return action
  }
}

export async function sendFriendshipNotification(
  action: NotificationAction.FRIENDSHIP_REQUEST | NotificationAction.FRIENDSHIP_ACCEPT,
  context: NotificationFriendshipInput,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void> {
  const { logs } = components
  const logger = logs.getLogger('notifications')

  if (!shouldNotify(action)) {
    throw new Error(`Invalid action: ${action}`)
  }

  const config = NOTIFICATION_EVENT_CONFIGS[action]
  if (!config) {
    throw new Error(`No notification config for action: ${action}`)
  }

  const { requestId, senderAddress, receiverAddress, senderProfile, receiverProfile, message } = context
  const notificationContext: NotificationFriendshipContext = {
    type: Events.Type.SOCIAL_SERVICE,
    requestId,
    senderAddress,
    receiverAddress,
    senderProfile,
    receiverProfile,
    message
  }

  try {
    const event = config.build(notificationContext)
    await sendNotificationWithRetry(action, event, notificationContext, components)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const finalErrorMessage = errorMessage.includes('Failed after')
      ? errorMessage
      : `Failed after 3 attempts: ${errorMessage}`

    // Use the original action name for logging
    const originalAction = action === NotificationAction.FRIENDSHIP_REQUEST ? Action.REQUEST : Action.ACCEPT

    logger.error(`Error sending notification for action ${originalAction}`, {
      error: finalErrorMessage,
      action: originalAction,
      senderAddress: context.senderAddress,
      receiverAddress: context.receiverAddress
    })
  }
}

export async function sendReferralNotification(
  action: NotificationAction.REFERRAL_INVITED_USERS_ACCEPTED | NotificationAction.REFERRAL_NEW_TIER_REACHED,
  context: NotificationReferralInput,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void> {
  const { logs } = components
  const logger = logs.getLogger('notifications')

  if (!shouldNotify(action)) {
    throw new Error(`Invalid action: ${action}`)
  }

  const config = NOTIFICATION_EVENT_CONFIGS[action]
  if (!config) {
    throw new Error(`No notification config for action: ${action}`)
  }

  const { title, description, address, tier, url, image, invitedUserAddress, invitedUsers, rarity } = context
  const notificationContext: NotificationReferralContext = {
    type: Events.Type.REFERRAL,
    title,
    description,
    address,
    tier,
    url,
    image,
    invitedUserAddress,
    invitedUsers,
    rarity
  }

  try {
    const event = config.build(notificationContext)
    await sendNotificationWithRetry(action, event, notificationContext, components)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const finalErrorMessage = errorMessage.includes('Failed after')
      ? errorMessage
      : `Failed after 3 attempts: ${errorMessage}`

    logger.error(`Error sending notification for action ${action}`, {
      error: finalErrorMessage,
      action,
      address: context.address,
      invitedUserAddress: context.invitedUserAddress
    })
  }
}

// Sobrecarga para mantener compatibilidad con tests
export function sendNotification(
  action: Action,
  context: NotificationFriendshipInput | NotificationReferralInput,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void>
export function sendNotification(
  action: NotificationAction,
  context: NotificationFriendshipInput | NotificationReferralInput,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void>
export async function sendNotification(
  action: Action | NotificationAction,
  context: NotificationFriendshipInput | NotificationReferralInput,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void> {
  const notificationAction =
    action === Action.REQUEST || action === Action.ACCEPT
      ? mapActionToNotificationAction(action as Action)
      : (action as NotificationAction)

  if (
    notificationAction === NotificationAction.FRIENDSHIP_REQUEST ||
    notificationAction === NotificationAction.FRIENDSHIP_ACCEPT
  ) {
    await sendFriendshipNotification(notificationAction, context as NotificationFriendshipInput, components)
  } else if (
    notificationAction === NotificationAction.REFERRAL_INVITED_USERS_ACCEPTED ||
    notificationAction === NotificationAction.REFERRAL_NEW_TIER_REACHED
  ) {
    await sendReferralNotification(notificationAction, context as NotificationReferralInput, components)
  } else {
    throw new Error(`Invalid action: ${action}`)
  }
}

async function sendNotificationWithRetry(
  action: NotificationAction,
  event:
    | FriendshipRequestEvent
    | FriendshipAcceptedEvent
    | ReferralInvitedUsersAcceptedEvent
    | ReferralNewTierReachedEvent,
  context: NotificationContext,
  components: Pick<AppComponents, 'sns' | 'logs'>
) {
  const { sns, logs } = components
  const logger = logs.getLogger('notifications')

  await retry(async (attempt) => {
    try {
      await sns.publishMessage(event)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const actionName = getActionName(action)

      logger.warn(`Attempt ${attempt} failed for action ${actionName}`, {
        error: errorMessage,
        action: actionName,
        ...('senderAddress' in context
          ? { senderAddress: context.senderAddress, receiverAddress: context.receiverAddress }
          : {}),
        ...('address' in context ? { address: context.address, invitedUserAddress: context.invitedUserAddress } : {})
      })
      throw error
    }
  })
}

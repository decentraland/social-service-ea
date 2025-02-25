import { Events } from '@dcl/schemas'
import { AppComponents, IPublisherComponent } from '../types'
import { Action } from '../types'
import { FriendshipRequestEvent, FriendshipAcceptedEvent } from '@dcl/schemas'
import { getProfileHasClaimedName, getProfileName, getProfilePictureUrl } from './profiles'
import { retry } from '../utils/retrier'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

type NotificationContext = {
  requestId: string
  senderAddress: string
  receiverAddress: string
  senderProfile: Pick<Profile, 'avatars'>
  receiverProfile: Pick<Profile, 'avatars'>
  message?: string
}

type NotificationHandler = (sns: IPublisherComponent, context: NotificationContext) => Promise<void>

const createEvent = <T extends FriendshipRequestEvent | FriendshipAcceptedEvent>(
  subType: T['subType'],
  context: NotificationContext
) => {
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
  } as T

  if (message) {
    return {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        message: message
      }
    }
  }

  return baseEvent
}

const handleFriendshipRequest: NotificationHandler = async (sns, context) => {
  const event = createEvent(Events.SubType.SocialService.FRIENDSHIP_REQUEST, context)
  await sns.publishMessage(event)
}

const handleFriendshipAccepted: NotificationHandler = async (sns, context) => {
  const event = createEvent(Events.SubType.SocialService.FRIENDSHIP_ACCEPTED, context)
  await sns.publishMessage(event)
}

const notificationHandlers: Pick<Record<Action, NotificationHandler>, Action.REQUEST | Action.ACCEPT> = {
  [Action.REQUEST]: handleFriendshipRequest,
  [Action.ACCEPT]: handleFriendshipAccepted
}

export const shouldNotify = (action: Action): action is Action.REQUEST | Action.ACCEPT =>
  [Action.REQUEST, Action.ACCEPT].includes(action)

export async function sendNotification(
  action: Action.REQUEST | Action.ACCEPT,
  context: NotificationContext,
  components: Pick<AppComponents, 'sns' | 'logs'>
): Promise<void> {
  const { logs } = components
  const logger = logs.getLogger('notifications')

  if (!shouldNotify(action)) {
    throw new Error(`Invalid action: ${action}`)
  }

  try {
    const handler = notificationHandlers[action]
    if (handler) {
      await sendNotificationWithRetry(action, context, components, handler)
    }
  } catch (error: any) {
    logger.error(`Error sending notification for action ${action}`, {
      error: error.message,
      action,
      senderAddress: context.senderAddress,
      receiverAddress: context.receiverAddress
    })
  }
}
async function sendNotificationWithRetry(
  action: Action,
  context: NotificationContext,
  components: Pick<AppComponents, 'sns' | 'logs'>,
  handler: NotificationHandler
) {
  const { sns, logs } = components
  const logger = logs.getLogger('notifications')

  await retry(async (attempt) => {
    try {
      await handler(sns, context)
      logger.info(`Notification sent for action ${action}`, {
        action,
        senderAddress: context.senderAddress,
        receiverAddress: context.receiverAddress
      })
    } catch (error: any) {
      logger.warn(`Attempt ${attempt} failed for action ${action}`, {
        error: error.message,
        action,
        senderAddress: context.senderAddress,
        receiverAddress: context.receiverAddress
      })
      throw error
    }
  })
}

import { Events, Entity } from '@dcl/schemas'
import { AppComponents, IPublisherComponent } from '../types'
import { Action } from '../types'
import { FriendshipRequestEvent, FriendshipAcceptedEvent } from '@dcl/schemas'
import { getProfileAvatar } from './profiles'

type NotificationContext = {
  senderAddress: string
  receiverAddress: string
  profile: Entity
  profileImagesUrl: string
  message?: string
}

type NotificationHandler = (sns: IPublisherComponent, context: NotificationContext) => Promise<void>

const createEvent = <T extends FriendshipRequestEvent | FriendshipAcceptedEvent>(
  subType: T['subType'],
  context: NotificationContext
) => {
  const { senderAddress, receiverAddress, profile, profileImagesUrl, message } = context
  const type = Events.Type.SOCIAL_SERVICE

  const baseEvent = {
    key: `${senderAddress}-${receiverAddress}-${type}-${subType}`,
    type,
    subType,
    timestamp: Date.now(),
    metadata: {
      sender: {
        address: senderAddress,
        name: getProfileAvatar(profile).name,
        profileImageUrl: `${profileImagesUrl}/${senderAddress}`
      },
      receiver: {
        address: receiverAddress
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
  const { sns, logs } = components
  const logger = logs.getLogger('notifications')

  try {
    if (!shouldNotify(action)) {
      throw new Error(`Invalid action: ${action}`)
    }

    const handler = notificationHandlers[action]

    if (handler) {
      await handler(sns, context)
      logger.info(`Notification sent for action ${action}`, {
        action,
        senderAddress: context.senderAddress,
        receiverAddress: context.receiverAddress
      })
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

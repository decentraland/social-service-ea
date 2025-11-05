import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { Action, AppComponents, RpcServerContext, SubscriptionEventsEmitter } from '../types'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'
import { normalizeAddress } from '../utils/address'
import { VoiceChatStatus } from './voice/types'
import { IUpdateHandlerComponent } from '../types/components'

type UpdateHandler<T extends keyof SubscriptionEventsEmitter> = (
  update: SubscriptionEventsEmitter[T]
) => void | Promise<void>

type UpdateParser<T, U> = (update: U, ...args: any[]) => T | null

export type UpdatesMessageHandler = (message: string) => void | Promise<void>

export type SubscriptionHandlerParams<T, U> = {
  rpcContext: RpcServerContext
  eventName: keyof SubscriptionEventsEmitter
  shouldRetrieveProfile?: boolean
  getAddressFromUpdate: (update: U) => string
  shouldHandleUpdate: (update: U) => boolean
  parser: UpdateParser<T, U>
  parseArgs?: any[]
}

export function createUpdateHandlerComponent(
  components: Pick<AppComponents, 'logs' | 'subscribersContext' | 'friendsDb' | 'communityMembers' | 'catalystClient'>
): IUpdateHandlerComponent {
  const { logs, subscribersContext, friendsDb, communityMembers, catalystClient } = components
  const logger = logs.getLogger('update-handler')

  function handleUpdate<T extends keyof SubscriptionEventsEmitter>(handler: UpdateHandler<T>) {
    return async (message: string) => {
      try {
        const update = JSON.parse(message) as SubscriptionEventsEmitter[T]
        await handler(update)
      } catch (error: any) {
        logger.error(`Error handling update: ${error.message}`, {
          error,
          message
        })
      }
    }
  }

  const friendshipUpdateHandler = handleUpdate<'friendshipUpdate'>((update) => {
    const updateEmitter = subscribersContext.getOrAddSubscriber(update.to)
    if (updateEmitter) {
      updateEmitter.emit('friendshipUpdate', update)
    }
  })

  const friendshipAcceptedUpdateHandler = handleUpdate<'friendshipUpdate'>((update) => {
    if (update.action !== Action.ACCEPT) {
      return
    }

    const notifications = [
      { subscriber: update.to, friend: update.from },
      { subscriber: update.from, friend: update.to }
    ]

    notifications.forEach(({ subscriber, friend }) => {
      const emitter = subscribersContext.getOrAddSubscriber(subscriber)
      if (emitter) {
        emitter.emit('friendConnectivityUpdate', {
          address: friend,
          status: ConnectivityStatus.ONLINE
        })
      }
    })
  })

  const friendConnectivityUpdateHandler = handleUpdate<'friendConnectivityUpdate'>(async (update) => {
    const onlineSubscribers = subscribersContext.getSubscribersAddresses()
    const friends = await friendsDb.getOnlineFriends(update.address, onlineSubscribers)

    // Notify friends about connectivity change
    friends.forEach(({ address: friendAddress }) => {
      const updateEmitter = subscribersContext.getOrAddSubscriber(friendAddress)
      if (updateEmitter) {
        updateEmitter.emit('friendConnectivityUpdate', update)
      }
    })
  })

  const communityMemberConnectivityUpdateHandler = handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    const onlineSubscribers = subscribersContext.getSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromUserCommunities(update.memberAddress, onlineSubscribers)

    for await (const batch of batches) {
      batch.forEach(({ communityId, memberAddress }) => {
        const updateEmitter = subscribersContext.getOrAddSubscriber(memberAddress)
        if (updateEmitter) {
          updateEmitter.emit('communityMemberConnectivityUpdate', {
            communityId,
            memberAddress: update.memberAddress,
            status: update.status
          })
        }
      })
    }
  })

  const blockUpdateHandler = handleUpdate<'blockUpdate'>((update) => {
    logger.info('Block update', {
      update: JSON.stringify(update)
    })

    const updateEmitter = subscribersContext.getOrAddSubscriber(update.blockedAddress)
    if (updateEmitter) {
      updateEmitter.emit('blockUpdate', update)
    }
  })

  const privateVoiceChatUpdateHandler = handleUpdate<'privateVoiceChatUpdate'>((update) => {
    logger.info('Private voice chat update', { update: JSON.stringify(update) })

    const addressesToNotify: string[] = []

    switch (update.status) {
      // Requested voice chats are only relevant for the callee, as they're being invited to the private voice chat
      case VoiceChatStatus.REQUESTED:
        if (update.calleeAddress) {
          addressesToNotify.push(update.calleeAddress)
        }
        break
      // Accepted voice chats are only relevant for the caller, as they're accepting the invitation
      case VoiceChatStatus.ACCEPTED:
        if (update.callerAddress) {
          addressesToNotify.push(update.callerAddress)
        }
        break
      // Rejected voice chats are only relevant for the caller, as they're rejecting the invitation
      case VoiceChatStatus.REJECTED:
        if (update.callerAddress) {
          addressesToNotify.push(update.callerAddress)
        }
        break
      // Ended voice chats are relevant for both the caller and the callee, as one of them is ending the call
      case VoiceChatStatus.ENDED:
        if (update.callerAddress) {
          addressesToNotify.push(update.callerAddress)
        }
        if (update.calleeAddress) {
          addressesToNotify.push(update.calleeAddress)
        }
        break
      // Expired voice chats are relevant for both the caller and the callee, as it has expired for both of them
      case VoiceChatStatus.EXPIRED:
        if (update.callerAddress) {
          addressesToNotify.push(update.callerAddress)
        }
        if (update.calleeAddress) {
          addressesToNotify.push(update.calleeAddress)
        }
        break
      default:
        return
    }

    addressesToNotify.forEach((address) => {
      const updateEmitter = subscribersContext.getOrAddSubscriber(address)
      if (updateEmitter) {
        updateEmitter.emit('privateVoiceChatUpdate', update)
      }
    })
  })

  const communityMemberStatusHandler = handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    const { communityId, status, memberAddress } = update
    const normalizedMemberAddress = normalizeAddress(memberAddress)

    logger.info('Community member status update', { update: JSON.stringify(update) })

    const onlineSubscribers = subscribersContext.getSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromCommunity(
      communityId,
      onlineSubscribers.filter((address) => address !== normalizedMemberAddress)
    )

    for await (const batch of batches) {
      batch.forEach(({ memberAddress }) => {
        const updateEmitter = subscribersContext.getOrAddSubscriber(memberAddress)
        if (updateEmitter) {
          updateEmitter.emit('communityMemberConnectivityUpdate', {
            communityId,
            memberAddress: update.memberAddress,
            status
          })
        }
      })
    }

    // When a member leaves, is kicked, or banned from a community,
    // we need to notify the affected member about their status change.
    const affectedMember = onlineSubscribers.find((address) => address === normalizedMemberAddress)
    const updateEmitter = affectedMember ? subscribersContext.getOrAddSubscriber(affectedMember) : null
    if (updateEmitter) {
      logger.debug('Notifying affected member about their status change', {
        update: JSON.stringify(update)
      })
      updateEmitter.emit('communityMemberConnectivityUpdate', update)
    }
  })

  const communityDeletedUpdateHandler = handleUpdate<'communityDeletedUpdate'>(async (update) => {
    const { communityId } = update

    const onlineSubscribers = subscribersContext.getSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromCommunity(communityId, onlineSubscribers)

    for await (const batch of batches) {
      batch.forEach(({ memberAddress }) => {
        const updateEmitter = subscribersContext.getOrAddSubscriber(memberAddress)
        if (updateEmitter) {
          updateEmitter.emit('communityMemberConnectivityUpdate', {
            communityId,
            memberAddress,
            status: ConnectivityStatus.OFFLINE
          })
        }
      })
    }
  })

  const communityVoiceChatUpdateHandler = handleUpdate<'communityVoiceChatUpdate'>(async (update) => {
    logger.info('Community voice chat update', { update: JSON.stringify(update) })

    const onlineSubscribers = subscribersContext.getSubscribersAddresses()

    try {
      // Get all online members of this community in a single efficient query
      const batches = communityMembers.getOnlineMembersFromCommunity(update.communityId, onlineSubscribers)
      const communityMemberAddresses = new Set<string>()

      for await (const batch of batches) {
        batch.forEach(({ memberAddress }) => {
          communityMemberAddresses.add(memberAddress)
        })
      }

      // Notify ALL online users with personalized membership info
      const notifications = onlineSubscribers.map(async (userAddress) => {
        const isMember = communityMemberAddresses.has(userAddress)

        // Create personalized update for this user
        const personalizedUpdate = {
          ...update,
          isMember
        }

        const updateEmitter = subscribersContext.getOrAddSubscriber(userAddress)
        if (updateEmitter) {
          updateEmitter.emit('communityVoiceChatUpdate', personalizedUpdate)
        }
      })

      // Wait for all notifications to complete
      await Promise.all(notifications)

      logger.info(`Community voice chat update sent to ${onlineSubscribers.length} online users`)
    } catch (error) {
      logger.error(`Failed to process community voice chat update for community ${update.communityId}: ${error}`)

      // Fallback: send update to all users without membership info
      const fallbackNotifications = onlineSubscribers.map(async (userAddress) => {
        const fallbackUpdate = {
          ...update,
          isMember: false
        }

        const updateEmitter = subscribersContext.getOrAddSubscriber(userAddress)
        if (updateEmitter) {
          updateEmitter.emit('communityVoiceChatUpdate', fallbackUpdate)
        }
      })

      await Promise.all(fallbackNotifications)
      logger.warn(`Sent fallback community voice chat update to ${onlineSubscribers.length} online users`)
    }
  })

  async function* handleSubscriptionUpdates<T, U>({
    rpcContext,
    eventName,
    shouldRetrieveProfile = false,
    getAddressFromUpdate,
    shouldHandleUpdate,
    parser,
    parseArgs = []
  }: SubscriptionHandlerParams<T, U>): AsyncGenerator<T> {
    const normalizedAddress = normalizeAddress(rpcContext.address)
    const eventEmitter = rpcContext.subscribersContext.getOrAddSubscriber(normalizedAddress)
    const eventNameString = String(eventName)

    const updatesGenerator = emitterToAsyncGenerator(eventEmitter, eventName)

    try {
      for await (const update of updatesGenerator) {
        if (!shouldHandleUpdate(update as U)) {
          continue
        }

        let profile: Profile | null = null

        try {
          profile = shouldRetrieveProfile ? await catalystClient.getProfile(getAddressFromUpdate(update as U)) : null
        } catch (_) {
          // If the profile is not found, skip the update
          logger.warn(`Unable to retrieve profile for ${getAddressFromUpdate(update as U)} in ${eventNameString}`)
          continue
        }

        const parsedUpdate = await parser(update as U, profile, ...parseArgs)
        if (parsedUpdate) {
          yield parsedUpdate
        } else {
          logger.error(`Unable to parse ${eventNameString}`, { update: JSON.stringify(update) })
        }
      }
    } catch (error) {
      logger.error('Error in generator loop', {
        error: JSON.stringify(error),
        address: rpcContext.address,
        event: eventNameString
      })
      throw error
    } finally {
      await updatesGenerator.return(undefined)
    }

    // Return a cleanup function
    return () => {
      logger.debug(`Cleaning up subscription for ${eventNameString}`, { address: rpcContext.address })
      void updatesGenerator.return(undefined)
    }
  }

  return {
    friendshipUpdateHandler,
    friendshipAcceptedUpdateHandler,
    friendConnectivityUpdateHandler,
    communityMemberConnectivityUpdateHandler,
    blockUpdateHandler,
    privateVoiceChatUpdateHandler,
    communityMemberStatusHandler,
    communityVoiceChatUpdateHandler,
    communityDeletedUpdateHandler,
    handleSubscriptionUpdates
  }
}

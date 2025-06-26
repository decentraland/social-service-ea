import { Action, AppComponents, RpcServerContext, SubscriptionEventsEmitter } from '../types'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'
import { normalizeAddress } from '../utils/address'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { VoiceChatStatus } from './voice/types'
import { GetCommunityMembersOptions } from './community'
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
      const emitter = subscribersContext.getOrAddSubscriber(friendAddress)
      if (emitter) {
        emitter.emit('friendConnectivityUpdate', update)
      } else {
        logger.warn('No emitter found for friend:', { friendAddress })
      }
    })
  })

  const communityMemberConnectivityUpdateHandler = handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    const onlineSubscribers = subscribersContext.getSubscribersAddresses()
    // TODO: paginate this and emit the updates in batches
    const onlineMembers = await communityMembers.getOnlineMembersFromUserCommunities(
      update.memberAddress,
      onlineSubscribers
    )

    onlineMembers.forEach(({ communityId, memberAddress }) => {
      const emitter = subscribersContext.getOrAddSubscriber(memberAddress)
      if (emitter) {
        emitter.emit('communityMemberConnectivityUpdate', {
          communityId,
          memberAddress: update.memberAddress,
          status: update.status
        })
      }
    })
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

  const createCommunityMemberStatusHandler = (expectedStatus: ConnectivityStatus) =>
    handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
      if (update.status !== expectedStatus) {
        return
      }

      logger.info('Community member status update', { update: JSON.stringify(update) })

      const PAGE_SIZE = 100
      let offset = 0
      let hasMoreMembers = true

      while (hasMoreMembers) {
        const options: GetCommunityMembersOptions = {
          onlyOnline: true,
          pagination: { limit: PAGE_SIZE, offset }
        }

        const { members, totalMembers } = await communityMembers.getCommunityMembers(
          update.communityId,
          update.memberAddress,
          options
        )

        members.forEach(({ memberAddress }) => {
          const updateEmitter = subscribersContext.getOrAddSubscriber(memberAddress)
          if (updateEmitter) {
            updateEmitter.emit('communityMemberConnectivityUpdate', update)
          }
        })

        offset += PAGE_SIZE
        hasMoreMembers = offset < totalMembers
      }
    })

  const communityMemberJoinHandler = createCommunityMemberStatusHandler(ConnectivityStatus.ONLINE)

  const communityMemberLeaveHandler = createCommunityMemberStatusHandler(ConnectivityStatus.OFFLINE)

  async function* handleSubscriptionUpdates<T, U>({
    rpcContext,
    eventName,
    shouldRetrieveProfile = true,
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

        const profile = shouldRetrieveProfile
          ? await catalystClient.getProfile(getAddressFromUpdate(update as U))
          : null
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
    communityMemberJoinHandler,
    communityMemberLeaveHandler,
    handleSubscriptionUpdates
  }
}

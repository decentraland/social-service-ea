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

/**
 * Processes an array in batches, yielding the event loop between batches.
 * This prevents long-running synchronous iterations from blocking the event loop.
 *
 * @param items - The array of items to process
 * @param processor - The function to call for each item
 * @param batchSize - Number of items to process before yielding (default: 10)
 */
async function processInBatches<T>(
  items: T[],
  processor: (item: T) => void | Promise<void>,
  batchSize: number = 10
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    for (const item of batch) {
      await processor(item)
    }

    // Yield the event loop if there are more items
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
}

export function createUpdateHandlerComponent(
  components: Pick<
    AppComponents,
    'logs' | 'subscribersContext' | 'friendsDb' | 'communityMembers' | 'registry' | 'metrics'
  >
): IUpdateHandlerComponent {
  const { logs, subscribersContext, friendsDb, communityMembers, registry, metrics } = components
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
    const updateEmitter = subscribersContext.getSubscriber(update.to)
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
      const emitter = subscribersContext.getSubscriber(subscriber)
      if (emitter) {
        emitter.emit('friendConnectivityUpdate', {
          address: friend,
          status: ConnectivityStatus.ONLINE
        })
      }
    })
  })

  const friendConnectivityUpdateHandler = handleUpdate<'friendConnectivityUpdate'>(async (update) => {
    // Derive recipients from THIS instance's local subscribers: every update is broadcast to
    // every instance via pub/sub and delivery is local-only, so each instance fans out to its
    // own connected subscribers (crash-safe, no global presence set needed).
    const onlineSubscribers = subscribersContext.getLocalSubscribersAddresses()
    const friends = await friendsDb.getOnlineFriends(update.address, onlineSubscribers)

    // Notify friends about connectivity change, yielding event loop for large friend lists
    await processInBatches(
      friends,
      ({ address: friendAddress }) => {
        const updateEmitter = subscribersContext.getSubscriber(friendAddress)
        if (updateEmitter) {
          updateEmitter.emit('friendConnectivityUpdate', update)
        }
      },
      20
    )
  })

  const communityMemberConnectivityUpdateHandler = handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    // Derive recipients from THIS instance's local subscribers: every update is broadcast to
    // every instance via pub/sub and delivery is local-only, so each instance fans out to its
    // own connected subscribers (crash-safe, no global presence set needed).
    const onlineSubscribers = subscribersContext.getLocalSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromUserCommunities(update.memberAddress, onlineSubscribers)

    for await (const batch of batches) {
      // Process each batch with event loop yielding
      await processInBatches(
        batch,
        ({ communityId, memberAddress }) => {
          const updateEmitter = subscribersContext.getSubscriber(memberAddress)
          if (updateEmitter) {
            updateEmitter.emit('communityMemberConnectivityUpdate', {
              communityId,
              memberAddress: update.memberAddress,
              status: update.status
            })
          }
        },
        20
      )
    }
  })

  const blockUpdateHandler = handleUpdate<'blockUpdate'>((update) => {
    logger.info('Block update', {
      update: JSON.stringify(update)
    })

    const updateEmitter = subscribersContext.getSubscriber(update.blockedAddress)
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
      const updateEmitter = subscribersContext.getSubscriber(address)
      if (updateEmitter) {
        updateEmitter.emit('privateVoiceChatUpdate', update)
      }
    })
  })

  const communityMemberStatusHandler = handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    const { communityId, status, memberAddress } = update
    const normalizedMemberAddress = normalizeAddress(memberAddress)

    logger.info('Community member status update', { update: JSON.stringify(update) })

    // Derive recipients from THIS instance's local subscribers: every update is broadcast to
    // every instance via pub/sub and delivery is local-only, so each instance fans out to its
    // own connected subscribers (crash-safe, no global presence set needed).
    const onlineSubscribers = subscribersContext.getLocalSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromCommunity(
      communityId,
      onlineSubscribers.filter((address) => address !== normalizedMemberAddress)
    )

    // Pre-create the update payload to avoid repeated object creation
    const memberUpdate = {
      communityId,
      memberAddress: update.memberAddress,
      status
    }

    for await (const batch of batches) {
      // Process each batch with event loop yielding
      await processInBatches(
        batch,
        ({ memberAddress: batchMemberAddress }) => {
          const updateEmitter = subscribersContext.getSubscriber(batchMemberAddress)
          if (updateEmitter) {
            updateEmitter.emit('communityMemberConnectivityUpdate', memberUpdate)
          }
        },
        20
      )
    }

    // When a member leaves, is kicked, or banned from a community,
    // we need to notify the affected member about their status change.
    const affectedMember = onlineSubscribers.find((address) => address === normalizedMemberAddress)
    const updateEmitter = affectedMember ? subscribersContext.getSubscriber(affectedMember) : undefined
    if (updateEmitter) {
      logger.debug('Notifying affected member about their status change', {
        update: JSON.stringify(update)
      })
      updateEmitter.emit('communityMemberConnectivityUpdate', update)
    }
  })

  const communityDeletedUpdateHandler = handleUpdate<'communityDeletedUpdate'>(async (update) => {
    const { communityId } = update

    // Derive recipients from THIS instance's local subscribers: every update is broadcast to
    // every instance via pub/sub and delivery is local-only, so each instance fans out to its
    // own connected subscribers (crash-safe, no global presence set needed).
    const onlineSubscribers = subscribersContext.getLocalSubscribersAddresses()
    const batches = communityMembers.getOnlineMembersFromCommunity(communityId, onlineSubscribers)

    for await (const batch of batches) {
      // Process each batch with event loop yielding
      await processInBatches(
        batch,
        ({ memberAddress }) => {
          const updateEmitter = subscribersContext.getSubscriber(memberAddress)
          if (updateEmitter) {
            updateEmitter.emit('communityMemberConnectivityUpdate', {
              communityId,
              memberAddress,
              status: ConnectivityStatus.OFFLINE
            })
          }
        },
        20
      )
    }
  })

  const communityVoiceChatUpdateHandler = handleUpdate<'communityVoiceChatUpdate'>(async (update) => {
    logger.info('Community voice chat update', { update: JSON.stringify(update) })

    // Get all online subscribers, excluding the creator if present (creator already knows about their action)
    const creatorAddress = update.creatorAddress?.toLowerCase()
    const allOnlineSubscribers = subscribersContext.getLocalSubscribersAddresses()
    const onlineSubscribers = allOnlineSubscribers.filter((address) => !creatorAddress || address !== creatorAddress)

    try {
      // Get all online members of this community in a single efficient query
      const batches = communityMembers.getOnlineMembersFromCommunity(update.communityId, onlineSubscribers)
      const communityMemberAddresses = new Set<string>()

      for await (const batch of batches) {
        batch.forEach(({ memberAddress }) => {
          communityMemberAddresses.add(memberAddress)
        })
      }

      // Pre-create the base update object to avoid repeated object spreads
      const baseUpdate = { ...update }

      // Notify ALL online users with personalized membership info (excluding the creator)
      // Process in batches to yield the event loop and prevent blocking
      await processInBatches(
        onlineSubscribers,
        (userAddress) => {
          const isMember = communityMemberAddresses.has(userAddress)
          const updateEmitter = subscribersContext.getSubscriber(userAddress)
          if (updateEmitter) {
            // Reuse base update, only set isMember property
            updateEmitter.emit('communityVoiceChatUpdate', { ...baseUpdate, isMember })
          }
        },
        20 // Process 20 users before yielding the event loop
      )

      logger.info(`Community voice chat update sent to ${onlineSubscribers.length} online users`)
    } catch (error) {
      logger.error(`Failed to process community voice chat update for community ${update.communityId}: ${error}`)

      // Fallback: send update to all users without membership info (still excluding the creator)
      const fallbackUpdate = { ...update, isMember: false }

      await processInBatches(
        onlineSubscribers,
        (userAddress) => {
          const updateEmitter = subscribersContext.getSubscriber(userAddress)
          if (updateEmitter) {
            updateEmitter.emit('communityVoiceChatUpdate', fallbackUpdate)
          }
        },
        20
      )

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
    const eventNameString = String(eventName)

    // Subscriptions are scoped per CONNECTION: the same address can be connected from
    // multiple places at once (website + client) and each connection gets its own stream.
    // wsConnectionId is always set in production (assigned at WS upgrade and threaded through
    // attachUser/attachTransport); fail loud rather than silently mis-key if it is missing.
    const connectionId = rpcContext.wsConnectionId
    if (!connectionId) {
      logger.error('Cannot handle subscription without a wsConnectionId', {
        address: normalizedAddress,
        event: eventNameString
      })
      return
    }

    // Guard against the SAME connection opening the same stream twice — each extra generator
    // allocates another value queue and doubles that connection's memory.
    if (rpcContext.subscribersContext.hasActiveSubscription(connectionId, eventNameString)) {
      // A connection re-subscribing to an event it is already subscribed to is expected and
      // benign — the guard is the #407 OOM protection (it prevents a second generator/value-queue
      // for the same connection+event). We both count it (the subscription_duplicates_total metric,
      // labelled by event) and log it at debug for per-connection visibility; a sustained high
      // rate/volume for a single connection indicates a client stuck in a re-subscribe loop.
      metrics.increment('subscription_duplicates_total', { event: eventNameString })
      logger.debug('Duplicate subscription detected, ignoring', {
        address: normalizedAddress,
        event: eventNameString,
        wsConnectionId: connectionId
      })
      return
    }

    // The shared per-address emitter is created when the connection attaches (addConnection).
    // If it's gone, the connection is no longer attached — don't resurrect an orphan emitter
    // that wouldn't be tracked as a live connection and would be invisible to the local fan-out.
    const eventEmitter = rpcContext.subscribersContext.getSubscriber(normalizedAddress)
    if (!eventEmitter) {
      logger.warn('No subscriber emitter for address; connection no longer attached', {
        address: normalizedAddress,
        event: eventNameString,
        wsConnectionId: connectionId
      })
      // Throw rather than return: a clean completion here invites the client to immediately
      // re-open the stream and hit this same path again — a hot loop. Erroring out makes a
      // (well-behaved) client back off instead. Reaching here means the RPC call is live but the
      // per-address emitter is gone, which is an abnormal/racy state, not a normal stream end.
      throw new Error('No subscriber emitter for address; connection no longer attached')
    }

    rpcContext.subscribersContext.setActiveSubscription(connectionId, eventNameString)

    const updatesGenerator = emitterToAsyncGenerator(eventEmitter, eventName, () =>
      metrics.increment('subscription_updates_dropped_total', { event: eventNameString })
    )
    rpcContext.subscribersContext.registerGenerator(connectionId, updatesGenerator)

    try {
      for await (const update of updatesGenerator) {
        if (!shouldHandleUpdate(update as U)) {
          continue
        }

        let profile: Profile | null = null

        try {
          profile = shouldRetrieveProfile ? await registry.getProfile(getAddressFromUpdate(update as U)) : null
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
      // Intentionally no catch here: errors propagate to the per-service subscribe handler,
      // which logs them with service-specific context and re-throws. A central catch would
      // double-log every subscription error (and only as JSON.stringify(error) === "{}").
    } finally {
      // Logged here (not in the per-service handler) so it only fires for subscriptions
      // that were actually established — the duplicate guard above returns before this
      // try/finally, so rejected duplicates no longer emit a misleading "cleaning up" line.
      logger.info('Cleaning up subscription', {
        address: normalizedAddress,
        event: eventNameString,
        wsConnectionId: connectionId
      })
      await updatesGenerator.return(undefined)
      rpcContext.subscribersContext.unregisterGenerator(connectionId, updatesGenerator)
      rpcContext.subscribersContext.clearActiveSubscription(connectionId, eventNameString)
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

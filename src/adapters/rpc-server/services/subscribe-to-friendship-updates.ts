import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { FriendshipUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendshipUpdate } from '../../../logic/friendships'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export function subscribeToFriendshipUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-friendship-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendshipUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* handleSubscriptionUpdates<FriendshipUpdate, SubscriptionEventsEmitter['friendshipUpdate']>({
        rpcContext: context,
        eventName: 'friendshipUpdate',
        components: {
          logger,
          catalystClient
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        parser: parseEmittedUpdateToFriendshipUpdate,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) =>
          update.from !== context.address && update.to === context.address
      })
    } catch (error: any) {
      logger.error('Error in friendship updates subscription:', error)
      throw error
    } finally {
      logger.info('Closing friendship updates subscription')
      cleanup?.()
    }
  }
}

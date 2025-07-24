import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { FriendshipUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendshipUpdate } from '../../../logic/friends'

export function subscribeToFriendshipUpdatesService({
  components: { logs, updateHandler }
}: RPCServiceContext<'logs' | 'updateHandler'>) {
  const logger = logs.getLogger('subscribe-to-friendship-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendshipUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* updateHandler.handleSubscriptionUpdates<
        FriendshipUpdate,
        SubscriptionEventsEmitter['friendshipUpdate']
      >({
        rpcContext: context,
        eventName: 'friendshipUpdate',
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        parser: parseEmittedUpdateToFriendshipUpdate,
        shouldRetrieveProfile: true,
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

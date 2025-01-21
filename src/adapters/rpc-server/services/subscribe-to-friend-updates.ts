import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import mitt from 'mitt'
import emitterToAsyncGenerator from '../../../utils/emitterToGenerator'
import { parseEmittedUpdateToFriendStatusUpdate } from '../../../logic/friendships'

export function subscribeToFriendUpdatesService({
  components: { logs, db, archipelagoStats }
}: RPCServiceContext<'logs' | 'db' | 'archipelagoStats'>) {
  const logger = logs.getLogger('subscribe-to-friend-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendUpdate> {
    try {
      const onlinePeers = await archipelagoStats.getPeersFromCache()
      const onlineFriends = db.getOnlineFriends(context.address, onlinePeers)

      for await (const friend of onlineFriends) {
        yield {
          user: { address: friend.address },
          status: ConnectivityStatus.ONLINE
        }
      }

      const eventEmitter = context.subscribers[context.address] || mitt<SubscriptionEventsEmitter>()

      if (!context.subscribers[context.address]) {
        context.subscribers[context.address] = eventEmitter
      }

      const updatesGenerator = emitterToAsyncGenerator(eventEmitter, 'friendStatusUpdate')
      for await (const update of updatesGenerator) {
        logger.debug('Friend status update received:', { update: JSON.stringify(update) })
        const updateToResponse = parseEmittedUpdateToFriendStatusUpdate(update)
        if (updateToResponse) {
          yield updateToResponse
        } else {
          logger.error('Unable to parse friend status update: ', { update: JSON.stringify(update) })
        }
      }
    } catch (error: any) {
      logger.error('Error in friend updates subscription:', error)
      throw error
    }
  }
}

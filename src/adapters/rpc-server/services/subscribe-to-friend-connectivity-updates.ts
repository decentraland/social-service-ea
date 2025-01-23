import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendConnectivityUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import mitt from 'mitt'
import emitterToAsyncGenerator from '../../../utils/emitterToGenerator'
import { parseEmittedUpdateToFriendStatusUpdate } from '../../../logic/friendships'
import { parseProfileToFriend } from '../../../logic/friends'

export async function subscribeToFriendConnectivityUpdatesService({
  components: { logs, db, archipelagoStats, config, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'archipelagoStats' | 'config' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-friend-connectivity-updates-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendConnectivityUpdate> {
    try {
      const eventEmitter = context.subscribers[context.address] || mitt<SubscriptionEventsEmitter>()

      if (!context.subscribers[context.address]) {
        context.subscribers[context.address] = eventEmitter
      }

      const onlinePeers = await archipelagoStats.getPeersFromCache()
      const onlineFriends = db.streamOnlineFriends(context.address, onlinePeers)

      for await (const friend of onlineFriends) {
        // TODO: improve this to avoid fetching the profile for each friend
        const profile = await catalystClient.getEntityByPointer(friend.address)
        yield {
          friend: parseProfileToFriend(profile, profileImagesUrl),
          status: ConnectivityStatus.ONLINE
        }
      }

      const updatesGenerator = emitterToAsyncGenerator(eventEmitter, 'friendStatusUpdate')
      for await (const update of updatesGenerator) {
        // TODO: move this to a separate function
        logger.debug('Friend status update received:', { update: JSON.stringify(update) })
        const profile = await catalystClient.getEntityByPointer(update.address)
        const updateToResponse = parseEmittedUpdateToFriendStatusUpdate(update, profile, profileImagesUrl)
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

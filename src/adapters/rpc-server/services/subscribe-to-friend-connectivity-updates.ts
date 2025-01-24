import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendConnectivityUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendConnectivityUpdate } from '../../../logic/friendships'
import { parseProfilesToFriends } from '../../../logic/friends'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export async function subscribeToFriendConnectivityUpdatesService({
  components: { logs, db, archipelagoStats, config, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'archipelagoStats' | 'config' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-friend-connectivity-updates-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendConnectivityUpdate> {
    try {
      const onlinePeers = await archipelagoStats.getPeersFromCache()
      const onlineFriends = await db.getOnlineFriends(context.address, onlinePeers)

      const profiles = await catalystClient.getEntitiesByPointers(onlineFriends.map((friend) => friend.address))
      const parsedProfiles = parseProfilesToFriends(profiles, profileImagesUrl).map((friend) => ({
        friend,
        status: ConnectivityStatus.ONLINE
      }))

      yield* parsedProfiles

      yield* handleSubscriptionUpdates({
        rpcContext: context,
        eventName: 'friendConnectivityUpdate',
        components: {
          catalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) => update.address,
        parser: parseEmittedUpdateToFriendConnectivityUpdate,
        parseArgs: [profileImagesUrl]
      })
    } catch (error: any) {
      logger.error('Error in friend updates subscription:', error)
      throw error
    }
  }
}

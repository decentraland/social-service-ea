import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext, IStatsComponent } from '../../../types'
import {
  FriendConnectivityUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendConnectivityUpdate } from '../../../logic/friendships'
import { parseProfilesToFriends } from '../../../logic/friends'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export function subscribeToFriendConnectivityUpdatesService({
  components: { logs, friendsDb, archipelagoStats, catalystClient, worldsStats }
}: RPCServiceContext<'logs' | 'friendsDb' | 'archipelagoStats' | 'catalystClient' | 'worldsStats'>) {
  const logger = logs.getLogger('subscribe-to-friend-connectivity-updates-service')

  async function getConnectedPeers() {
    const peersGetters: IStatsComponent[] = [archipelagoStats, worldsStats]
    const peers = await Promise.all(peersGetters.map((peersGetter) => peersGetter.getPeers().catch(() => [])))
    return Array.from(new Set(peers.flat()))
  }

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendConnectivityUpdate> {
    let cleanup: (() => void) | undefined

    try {
      const onlinePeers = await getConnectedPeers()
      const onlineFriends = await friendsDb.getOnlineFriends(context.address, onlinePeers)

      const profiles = await catalystClient.getProfiles(onlineFriends.map((friend) => friend.address))
      const parsedProfiles = parseProfilesToFriends(profiles).map((friend) => ({
        friend,
        status: ConnectivityStatus.ONLINE
      }))

      yield* parsedProfiles

      cleanup = yield* handleSubscriptionUpdates({
        rpcContext: context,
        eventName: 'friendConnectivityUpdate',
        components: {
          catalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) => update.address,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) =>
          update.address !== context.address,
        parser: parseEmittedUpdateToFriendConnectivityUpdate
      })
    } catch (error: any) {
      logger.error('Error in friend connectivity updates subscription:', error)
      throw error
    } finally {
      logger.info('Cleaning up friend connectivity updates subscription')
      cleanup?.()
    }
  }
}

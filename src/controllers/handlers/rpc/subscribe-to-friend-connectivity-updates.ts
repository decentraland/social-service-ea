import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendConnectivityUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendConnectivityUpdate, parseProfilesToFriends } from '../../../logic/friends'

export function subscribeToFriendConnectivityUpdatesService({
  components: { logs, friendsDb, registry, peersStats, updateHandler }
}: RPCServiceContext<'logs' | 'friendsDb' | 'registry' | 'peersStats' | 'updateHandler'>) {
  const logger = logs.getLogger('subscribe-to-friend-connectivity-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendConnectivityUpdate> {
    try {
      yield* updateHandler.handleSubscriptionUpdates<
        FriendConnectivityUpdate,
        SubscriptionEventsEmitter['friendConnectivityUpdate']
      >({
        rpcContext: context,
        eventName: 'friendConnectivityUpdate',
        shouldRetrieveProfile: true,
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) => update.address,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) =>
          update.address !== context.address,
        parser: parseEmittedUpdateToFriendConnectivityUpdate,
        // fromPartial fills the remaining fields with protobuf defaults so the final
        // "stream closed" message is safe to encode.
        buildStreamClosedUpdate: (streamClosed) => FriendConnectivityUpdate.fromPartial({ streamClosed }),
        // Initial online-friends snapshot. Delivered by handleSubscriptionUpdates AFTER the
        // live listener is registered, so connectivity changes emitted while these queries
        // run are queued rather than lost. Best-effort: a DB/registry hiccup is logged there
        // and the subscription continues with live updates only.
        getInitialUpdates: async () => {
          const onlinePeers = await peersStats.getConnectedPeers()
          const onlineFriends = await friendsDb.getOnlineFriends(context.address, onlinePeers)

          const profiles = await registry.getProfiles(onlineFriends.map((friend) => friend.address))
          return parseProfilesToFriends(profiles).map((friend) => ({
            friend,
            status: ConnectivityStatus.ONLINE
          }))
        }
      })
    } catch (error: any) {
      logger.error('Error in friend connectivity updates subscription:', error)
      throw error
    }
  }
}

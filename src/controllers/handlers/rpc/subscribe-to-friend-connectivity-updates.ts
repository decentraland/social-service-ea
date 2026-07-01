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
    // Initial online-friends snapshot. Best-effort: a DB/registry hiccup here must NOT tear down
    // the whole subscription — otherwise the client just reconnects and retries, churning (and
    // re-running these queries every time). Log and fall through to live updates instead.
    try {
      const onlinePeers = await peersStats.getConnectedPeers()
      const onlineFriends = await friendsDb.getOnlineFriends(context.address, onlinePeers)

      const profiles = await registry.getProfiles(onlineFriends.map((friend) => friend.address))
      const parsedProfiles = parseProfilesToFriends(profiles).map((friend) => ({
        friend,
        status: ConnectivityStatus.ONLINE
      }))

      yield* parsedProfiles
    } catch (error: any) {
      logger.warn('Failed to deliver initial friend connectivity snapshot; continuing with live updates', {
        address: context.address,
        error: error?.message ?? String(error)
      })
    }

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
        parser: parseEmittedUpdateToFriendConnectivityUpdate
      })
    } catch (error: any) {
      logger.error('Error in friend connectivity updates subscription:', error)
      throw error
    }
  }
}

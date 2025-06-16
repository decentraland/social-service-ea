import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import { CommunityMemberConnectivityUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { handleSubscriptionUpdates } from '../../../logic/updates'
import { parseCommunityMemberConnectivityUpdate } from '../../../logic/community/parsers'

export function subscribeToCommunityMemberConnectivityUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-community-member-connectivity-updates-service')

  return async function* (
    _request: Empty,
    context: RpcServerContext
  ): AsyncGenerator<CommunityMemberConnectivityUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* handleSubscriptionUpdates({
        rpcContext: context,
        eventName: 'communityMemberConnectivityUpdate',
        components: {
          catalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']) =>
          update.memberAddress,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']) =>
          update.memberAddress !== context.address,
        parser: parseCommunityMemberConnectivityUpdate
      })
    } catch (error: any) {
      logger.error('Error in community member connectivity updates subscription:', error)
      throw error
    } finally {
      logger.info('Cleaning up community member connectivity updates subscription')
      cleanup?.()
    }
  }
}

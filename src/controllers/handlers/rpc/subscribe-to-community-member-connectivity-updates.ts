import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { CommunityMemberConnectivityUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

/**
 * Converts the emitted update to the community member connectivity update.
 * @param update - The update to convert.
 * @returns The community member connectivity update.
 */
function parseEmittedUpdateToCommunityMemberConnectivityUpdate(
  update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
): CommunityMemberConnectivityUpdate | null {
  const { communityId, memberAddress, status } = update
  return {
    communityId,
    member: {
      address: memberAddress
    },
    status
  }
}

export function subscribeToCommunityMemberConnectivityUpdatesService({
  components: { logs, updateHandler }
}: RPCServiceContext<'logs' | 'updateHandler'>) {
  const logger = logs.getLogger('subscribe-to-community-member-connectivity-updates-service')

  return async function* (
    _request: Empty,
    context: RpcServerContext
  ): AsyncGenerator<CommunityMemberConnectivityUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* updateHandler.handleSubscriptionUpdates<
        CommunityMemberConnectivityUpdate,
        SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
      >({
        rpcContext: context,
        eventName: 'communityMemberConnectivityUpdate',
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']) =>
          update.memberAddress,
        shouldHandleUpdate: (_update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']) => true,
        parser: parseEmittedUpdateToCommunityMemberConnectivityUpdate
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

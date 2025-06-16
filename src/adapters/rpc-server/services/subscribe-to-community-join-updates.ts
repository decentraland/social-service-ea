import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { SubscriptionEventsEmitter, RpcServerContext, RPCServiceContext } from '../../../types'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export function subscribeToCommunityJoinUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-community-join-updates-service')

  return async function* (
    _request: Empty,
    context: RpcServerContext
  ): AsyncGenerator<SubscriptionEventsEmitter['communityJoinUpdate']> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* handleSubscriptionUpdates({
        rpcContext: context,
        eventName: 'communityJoinUpdate',
        components: {
          catalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['communityJoinUpdate']) => update.memberAddress,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['communityJoinUpdate']) =>
          update.memberAddress !== context.address,
        parser: (update) => update
      })
    } catch (error: any) {
      logger.error('Error in community join updates subscription:', error)
      throw error
    } finally {
      logger.info('Cleaning up community join updates subscription')
      cleanup?.()
    }
  }
}

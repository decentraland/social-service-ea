import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { BlockUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToBlockUpdate } from '../../../logic/blocks'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export function subscribeToBlockUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-block-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<BlockUpdate> {
    let cleanup: (() => void) | undefined

    // The blocked/unblocked user should know who blocked/unblocked them
    try {
      cleanup = yield* handleSubscriptionUpdates<BlockUpdate, SubscriptionEventsEmitter['blockUpdate']>({
        rpcContext: context,
        eventName: 'blockUpdate',
        components: {
          catalystClient,
          logger
        },
        shouldRetrieveProfile: false,
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockerAddress,
        parser: parseEmittedUpdateToBlockUpdate,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) =>
          update.blockedAddress === context.address
      })
    } catch (error: any) {
      logger.error('Error in block updates subscription:', error)
      throw error
    } finally {
      logger.info('Closing block updates subscription')
      cleanup?.()
    }
  }
}

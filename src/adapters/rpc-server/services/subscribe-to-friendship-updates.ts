import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { FriendshipUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { parseEmittedUpdateToFriendshipUpdate } from '../../../logic/friendships'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export async function subscribeToFriendshipUpdatesService({
  components: { logs, config, catalystClient }
}: RPCServiceContext<'logs' | 'config' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-friendship-updates-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendshipUpdate> {
    yield* handleSubscriptionUpdates<FriendshipUpdate, SubscriptionEventsEmitter['friendshipUpdate']>({
      rpcContext: context,
      eventName: 'friendshipUpdate',
      components: {
        logger,
        catalystClient
      },
      getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
      parser: parseEmittedUpdateToFriendshipUpdate,
      shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) =>
        update.from !== context.address && update.to === context.address,
      parseArgs: [profileImagesUrl]
    })
  }
}

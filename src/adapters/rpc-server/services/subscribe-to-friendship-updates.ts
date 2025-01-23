import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { FriendshipUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import mitt from 'mitt'
import { parseEmittedUpdateToFriendshipUpdate } from '../../../logic/friendships'
import { handleSubscriptionUpdates } from '../../../logic/updates'

export async function subscribeToFriendshipUpdatesService({
  components: { logs, config, catalystClient }
}: RPCServiceContext<'logs' | 'config' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-friendship-updates-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendshipUpdate> {
    const eventEmitter = context.subscribers[context.address] || mitt<SubscriptionEventsEmitter>()

    if (!context.subscribers[context.address]) {
      context.subscribers[context.address] = eventEmitter
    }

    yield* handleSubscriptionUpdates<FriendshipUpdate, SubscriptionEventsEmitter['friendshipUpdate']>({
      eventEmitter,
      eventName: 'friendshipUpdate',
      logger,
      catalystClient,
      parser: parseEmittedUpdateToFriendshipUpdate,
      addressGetter: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
      parseArgs: [profileImagesUrl]
    })
  }
}

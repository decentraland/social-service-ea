import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { FriendshipUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import mitt from 'mitt'
import { parseEmittedUpdateToFriendshipUpdate } from '../../../logic/friendships'
import emitterToAsyncGenerator from '../../../utils/emitterToGenerator'

export function subscribeToFriendshipUpdatesService({ components: { logs } }: RPCServiceContext<'logs'>) {
  const logger = logs.getLogger('subscribe-to-friendship-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<FriendshipUpdate> {
    const eventEmitter = context.subscribers[context.address] || mitt<SubscriptionEventsEmitter>()

    if (!context.subscribers[context.address]) {
      context.subscribers[context.address] = eventEmitter
    }

    const updatesGenerator = emitterToAsyncGenerator(eventEmitter, 'friendshipUpdate')

    for await (const update of updatesGenerator) {
      logger.debug('Friendship update received:', { update: JSON.stringify(update) })
      const updateToResponse = parseEmittedUpdateToFriendshipUpdate(update)
      if (updateToResponse) {
        yield updateToResponse
      } else {
        logger.error('Unable to parse friendship update: ', { update: JSON.stringify(update) })
      }
    }
  }
}

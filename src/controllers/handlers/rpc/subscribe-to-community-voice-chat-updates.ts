import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { CommunityVoiceChatUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

/**
 * Converts the emitted update to the community voice chat update.
 * @param update - The update to convert.
 * @returns The community voice chat update.
 */
function parseEmittedUpdateToCommunityVoiceChatUpdate(
  update: SubscriptionEventsEmitter['communityVoiceChatUpdate']
): CommunityVoiceChatUpdate {
  return {
    communityId: update.communityId,
    voiceChatId: update.voiceChatId,
    createdAt: Date.now()
  }
}

export function subscribeToCommunityVoiceChatUpdatesService({
  components: { logs, updateHandler }
}: RPCServiceContext<'logs' | 'updateHandler'>) {
  const logger = logs.getLogger('subscribe-to-community-voice-chat-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<CommunityVoiceChatUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* updateHandler.handleSubscriptionUpdates<
        CommunityVoiceChatUpdate,
        SubscriptionEventsEmitter['communityVoiceChatUpdate']
      >({
        rpcContext: context,
        eventName: 'communityVoiceChatUpdate',
        shouldRetrieveProfile: false,
        getAddressFromUpdate: () => 'not-needed',
        parser: parseEmittedUpdateToCommunityVoiceChatUpdate,
        shouldHandleUpdate: () => true // Handle all community voice chat updates for now
      })
    } catch (error: any) {
      logger.error(`Error in community voice chat updates subscription: ${error.message}`)
      throw error
    } finally {
      logger.info('Closing community voice chat updates subscription')
      cleanup?.()
    }
  }
}

import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import { CommunityVoiceChatUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { isErrorWithMessage } from '../../../utils/errors'

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
    createdAt: Date.now(),
    status: update.status,
    positions: update.positions || [],
    isMember: update.isMember || false,
    communityName: update.communityName || '',
    communityImage: update.communityImage
  } as CommunityVoiceChatUpdate
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
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error in community voice chat updates subscription: ${errorMessage}`)
      throw error
    } finally {
      logger.info('Closing community voice chat updates subscription')
      cleanup?.()
    }
  }
}

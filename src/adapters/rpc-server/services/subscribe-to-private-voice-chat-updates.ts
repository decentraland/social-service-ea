import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import {
  PrivateVoiceChatStatus,
  PrivateVoiceChatUpdate,
  User
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { handleSubscriptionUpdates } from '../../../logic/updates'
import { VoiceChatStatus } from '../../../logic/voice/types'
import { isErrorWithMessage } from '../../../utils/errors'

/**
 * Converts the voice chat status from the update to the private voice chat status.
 * @param update - The update to convert.
 * @returns The private voice chat status.
 */
function getStatusFromUpdate(update: SubscriptionEventsEmitter['privateVoiceChatUpdate']): PrivateVoiceChatStatus {
  switch (update.status) {
    case VoiceChatStatus.REQUESTED:
      return PrivateVoiceChatStatus.VOICE_CHAT_REQUESTED
    case VoiceChatStatus.ACCEPTED:
      return PrivateVoiceChatStatus.VOICE_CHAT_ACCEPTED
    case VoiceChatStatus.REJECTED:
      return PrivateVoiceChatStatus.VOICE_CHAT_REJECTED
    case VoiceChatStatus.ENDED:
      return PrivateVoiceChatStatus.VOICE_CHAT_ENDED
    case VoiceChatStatus.EXPIRED:
      return PrivateVoiceChatStatus.VOICE_CHAT_EXPIRED
    default:
      throw new Error(`Unknown voice chat status: ${update.status}`)
  }
}

/**
 * Converts the emitted update to the private voice chat update.
 * @param update - The update to convert.
 * @returns The private voice chat update.
 */
function parseEmittedUpdateToPrivateVoiceChatUpdate(
  update: SubscriptionEventsEmitter['privateVoiceChatUpdate']
): PrivateVoiceChatUpdate {
  return {
    callId: update.callId,
    status: getStatusFromUpdate(update),
    caller:
      update.status === VoiceChatStatus.REQUESTED
        ? User.create({
            address: update.callerAddress
          })
        : undefined
  }
}

export function subscribeToPrivateVoiceChatUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient' | 'voice'>) {
  const logger = logs.getLogger('subscribe-to-private-voice-chat-updates-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<PrivateVoiceChatUpdate> {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* handleSubscriptionUpdates<
        PrivateVoiceChatUpdate,
        SubscriptionEventsEmitter['privateVoiceChatUpdate']
      >({
        rpcContext: context,
        eventName: 'privateVoiceChatUpdate',
        components: {
          catalystClient,
          logger
        },
        shouldRetrieveProfile: false,
        getAddressFromUpdate: () => 'not-needed',
        parser: parseEmittedUpdateToPrivateVoiceChatUpdate,
        // Only handle updates that are known by the this subscription call
        shouldHandleUpdate: (update) => Object.values(VoiceChatStatus).includes(update.status)
      })
    } catch (error) {
      logger.error(
        `Error in private voice chat updates subscription: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    } finally {
      logger.info('Closing private voice chat updates subscription')
      cleanup?.()
    }
  }
}

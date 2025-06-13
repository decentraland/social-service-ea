import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext, SubscriptionEventsEmitter } from '../../../types'
import {
  PrivateVoiceChatCredentials,
  PrivateVoiceChatStatus,
  PrivateVoiceChatUpdate,
  User
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { handleSubscriptionUpdates } from '../../../logic/updates'
import { VoiceChatStatus } from '../../../logic/voice/types'
import { isErrorWithMessage } from '../../../utils/errors'

const VOICE_CHAT_STATUS_TO_PRIVATE_VOICE_CHAT_STATUS: Record<VoiceChatStatus, PrivateVoiceChatStatus> = {
  [VoiceChatStatus.REQUESTED]: PrivateVoiceChatStatus.VOICE_CHAT_REQUESTED,
  [VoiceChatStatus.ACCEPTED]: PrivateVoiceChatStatus.VOICE_CHAT_ACCEPTED,
  [VoiceChatStatus.REJECTED]: PrivateVoiceChatStatus.VOICE_CHAT_REJECTED,
  [VoiceChatStatus.ENDED]: PrivateVoiceChatStatus.VOICE_CHAT_ENDED,
  [VoiceChatStatus.EXPIRED]: PrivateVoiceChatStatus.VOICE_CHAT_EXPIRED
}

/**
 * Converts the emitted update to the private voice chat update.
 * @param update - The update to convert.
 * @returns The private voice chat update.
 */
function parseEmittedUpdateToPrivateVoiceChatUpdate(
  update: SubscriptionEventsEmitter['privateVoiceChatUpdate']
): PrivateVoiceChatUpdate {
  const status = VOICE_CHAT_STATUS_TO_PRIVATE_VOICE_CHAT_STATUS[update.status]
  if (status === undefined) {
    throw new Error(`Unknown voice chat status: ${update.status}`)
  }

  return {
    callId: update.callId,
    status,
    caller:
      update.status === VoiceChatStatus.REQUESTED
        ? User.create({
            address: update.callerAddress
          })
        : undefined,
    credentials: update.credentials
      ? PrivateVoiceChatCredentials.create({
          connectionUrl: update.credentials.connectionUrl
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

import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  CommunityVoiceChatPermissionError,
  InvalidCommunityIdError,
  InvalidUserAddressError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'
import {
  MuteSpeakerFromCommunityVoiceChatPayload,
  MuteSpeakerFromCommunityVoiceChatResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function muteSpeakerFromCommunityVoiceChatService({
  components: { logs, communityVoice }
}: RPCServiceContext<'logs' | 'communityVoice'>) {
  const logger = logs.getLogger('mute-speaker-from-community-voice-chat-rpc')

  return async function (
    request: MuteSpeakerFromCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<MuteSpeakerFromCommunityVoiceChatResponse> {
    try {
      logger.info('Muting/unmuting speaker from community voice chat', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        muted: request.muted.toString(),
        actingUserAddress: context.address
      })

      await communityVoice.muteSpeakerInCommunityVoiceChat(
        request.communityId,
        request.userAddress,
        context.address,
        request.muted
      )

      const action = request.muted ? 'muted' : 'unmuted'
      logger.info(`Speaker ${action} successfully`, {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        actingUserAddress: context.address,
        muted: request.muted.toString()
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            muted: request.muted
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to mute/unmute speaker from community voice chat:', {
        errorMessage: errorMessage,
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        actingUserAddress: context.address,
        muted: request.muted.toString()
      })

      // Handle specific error types
      if (error instanceof CommunityVoiceChatPermissionError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      if (error instanceof InvalidCommunityIdError || error instanceof InvalidUserAddressError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: { message: `Failed to mute/unmute speaker from community voice chat: ${errorMessage}` }
        }
      }
    }
  }
}

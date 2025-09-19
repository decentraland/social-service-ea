import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  CommunityVoiceChatPermissionError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'
import { CommunityRole } from '../../../types/entities'

// Temporary types until they are generated from protocol
type MuteSpeakerFromCommunityVoiceChatPayload = {
  communityId: string
  userAddress: string
  muted: boolean
}

type MuteSpeakerFromCommunityVoiceChatResponse = {
  response:
    | { $case: 'ok'; ok: { message: string } }
    | { $case: 'forbiddenError'; forbiddenError: { message: string } }
    | { $case: 'notFoundError'; notFoundError: { message: string } }
    | { $case: 'invalidRequest'; invalidRequest: { message: string } }
    | { $case: 'internalServerError'; internalServerError: { message: string } }
}

export function muteSpeakerFromCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
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

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      if (typeof request.muted !== 'boolean') {
        logger.warn('Invalid muted value in request')
        throw new Error('Muted value must be a boolean')
      }

      const targetUserAddress = request.userAddress.toLowerCase()
      const actingUserAddress = context.address.toLowerCase()

      // Check if it's a self-mute operation
      const isSelfMute = targetUserAddress === actingUserAddress

      if (!isSelfMute) {
        // Check permissions: only owners and moderators can mute/unmute other players
        const actingUserRole = await communitiesDb.getCommunityMemberRole(request.communityId, actingUserAddress)
        if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
          throw new CommunityVoiceChatPermissionError(
            'Only community owners, moderators, or the user themselves can mute/unmute speakers'
          )
        }

        logger.info('Permission check passed: moderator/owner muting player', {
          communityId: request.communityId,
          actingUserRole,
          targetUserAddress,
          actingUserAddress
        })
      } else {
        logger.info('Self-mute operation', {
          communityId: request.communityId,
          userAddress: targetUserAddress
        })
      }

      await commsGatekeeper.muteSpeakerInCommunityVoiceChat(request.communityId, targetUserAddress, request.muted)

      const action = request.muted ? 'muted' : 'unmuted'
      logger.info(`Speaker ${action} successfully`, {
        communityId: request.communityId,
        targetUserAddress,
        actingUserAddress,
        muted: request.muted.toString()
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: `User ${action} successfully`
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
      if (error instanceof UserNotCommunityMemberError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      if (error instanceof CommunityVoiceChatPermissionError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      if (error instanceof CommunityVoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFoundError',
            notFoundError: { message: error.message }
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
          internalServerError: { message: 'Failed to mute/unmute speaker from community voice chat' }
        }
      }
    }
  }
}

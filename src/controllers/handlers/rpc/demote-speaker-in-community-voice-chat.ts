import {
  DemoteSpeakerInCommunityVoiceChatPayload,
  DemoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  CommunityVoiceChatPermissionError,
  validateCommunityVoiceChatTargetUser
} from '../../../logic/community-voice'
import { isErrorWithMessage } from '../../../utils/errors'
import { CommunityRole } from '../../../types/entities'

export function demoteSpeakerInCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
  const logger = logs.getLogger('demote-speaker-in-community-voice-chat-rpc')

  return async function (
    request: DemoteSpeakerInCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<DemoteSpeakerInCommunityVoiceChatResponse> {
    try {
      logger.info('Demoting speaker in community voice chat', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      const isSelfDemote = context.address.toLowerCase() === request.userAddress.toLowerCase()

      // Get community information to check privacy setting
      const community = await communitiesDb.getCommunity(request.communityId, context.address)
      if (!community) {
        throw new InvalidCommunityIdError()
      }

      // Get the role of the acting user (person making the request)
      const actingUserRole = await communitiesDb.getCommunityMemberRole(request.communityId, context.address)

      // For private communities, acting user must be a member
      // For public communities, we allow voice chat participants to manage themselves and moderators to manage others
      if (community.privacy === 'private' && actingUserRole === CommunityRole.None) {
        throw new UserNotCommunityMemberError(context.address, request.communityId)
      }

      // If user is trying to demote someone else, check permissions
      if (!isSelfDemote) {
        // Only owners and moderators can demote other users
        if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
          throw new CommunityVoiceChatPermissionError('Only community owners and moderators can demote other speakers')
        }

        // Validate target user can be demoted based on community privacy and membership
        await validateCommunityVoiceChatTargetUser(communitiesDb, community, request.communityId, request.userAddress)

        logger.info('Permission check passed: moderator/owner demoting another user', {
          communityId: request.communityId,
          actingUserRole,
          targetUserAddress: request.userAddress,
          communityPrivacy: community.privacy
        })
      } else {
        logger.info('Self-demote detected: allowing user to demote themselves', {
          communityId: request.communityId,
          userAddress: request.userAddress,
          communityPrivacy: community.privacy
        })
      }

      await commsGatekeeper.demoteSpeakerInCommunityVoiceChat(request.communityId, request.userAddress)

      logger.info('Speaker demoted successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address,
        isSelfDemote: isSelfDemote.toString()
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: isSelfDemote
              ? 'You have been demoted to listener successfully'
              : 'User demoted to listener successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to demote speaker in community voice chat:', {
        errorMessage: errorMessage,
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
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
          internalServerError: { message: 'Failed to demote speaker in community voice chat' }
        }
      }
    }
  }
}

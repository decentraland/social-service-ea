import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { 
  UserNotCommunityMemberError, 
  CommunityVoiceChatNotFoundError 
} from '../../../logic/community-voice/errors'
import { CommunityRole } from '../../../types'

export async function demoteSpeakerHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communities' | 'commsGatekeeper' | 'communitiesDb', '/v1/communities/:id/voice-chat/demote-speaker'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    components: { logs, communities, commsGatekeeper, communitiesDb },
    params: { id: communityId },
    verification,
    request
  } = context

  const logger = logs.getLogger('demote-speaker-handler')
  const userAddress = verification!.auth.toLowerCase()

  try {
    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch {
      return {
        status: 400,
        body: {
          message: 'Invalid request body'
        }
      }
    }

    // Validate required fields
    if (!body.userAddress || typeof body.userAddress !== 'string') {
      return {
        status: 400,
        body: {
          message: 'User address is required'
        }
      }
    }

    const targetUserAddress = body.userAddress.toLowerCase()

    // Check if user is a member of the community
    const community = await communities.getCommunity(communityId, userAddress)
    if (!community) {
      return {
        status: 404,
        body: {
          message: 'Community not found'
        }
      }
    }

    // Get user role for permission check
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)

    // Check if user has permission to demote speakers (must be moderator or owner)
    if (userRole !== CommunityRole.Moderator && userRole !== CommunityRole.Owner) {
      return {
        status: 403,
        body: {
          message: 'You do not have permission to demote speakers'
        }
      }
    }

    // Check if target user is a member of the community  
    const isMember = await communitiesDb.isMemberOfCommunity(communityId, targetUserAddress)
    if (!isMember) {
      return {
        status: 403,
        body: {
          message: 'Target user is not a member of the community'
        }
      }
    }

    // Check if voice chat is active
    const voiceChatStatus = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!voiceChatStatus || !voiceChatStatus.isActive) {
      return {
        status: 404,
        body: {
          message: 'Community voice chat not found or not active'
        }
      }
    }

    // Send request to comms-gatekeeper to demote user
    await commsGatekeeper.updateUserMetadataInCommunityVoiceChat(communityId, targetUserAddress, {
      canPublishTracks: false,
      isRequestingToSpeak: false
    })

    logger.info('User demoted to listener in community voice chat', {
      communityId,
      targetUserAddress,
      demotedBy: userAddress
    })

    return {
      status: 200,
      body: {
        message: 'User demoted to listener successfully'
      }
    }
  } catch (error) {
    logger.error('Error handling demote speaker', { error: errorMessageOrDefault(error), communityId, userAddress })

    if (error instanceof CommunityNotFoundError) {
      return {
        status: 404,
        body: {
          message: 'Community not found'
        }
      }
    }

    if (error instanceof UserNotCommunityMemberError) {
      return {
        status: 403,
        body: {
          message: error.message
        }
      }
    }

    if (error instanceof CommunityVoiceChatNotFoundError) {
      return {
        status: 404,
        body: {
          message: error.message
        }
      }
    }

    return {
      status: 500,
      body: {
        message: errorMessageOrDefault(error)
      }
    }
  }
} 
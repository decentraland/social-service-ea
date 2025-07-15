import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { 
  UserNotCommunityMemberError, 
  CommunityVoiceChatNotFoundError 
} from '../../../logic/community-voice/errors'

export async function requestToSpeakHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communities' | 'commsGatekeeper' | 'communitiesDb', '/v1/communities/:id/voice-chat/request-to-speak'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    components: { logs, communities, commsGatekeeper, communitiesDb },
    params: { id: communityId },
    verification,
    request
  } = context

  const logger = logs.getLogger('request-to-speak-handler')
  const userAddress = verification!.auth.toLowerCase()

  let targetUserAddress: string

  try {
    const body = await request.json()
    targetUserAddress = body.userAddress?.toLowerCase()

    if (!targetUserAddress) {
      return {
        status: 400,
        body: {
          message: 'User address is required'
        }
      }
    }
  } catch (error) {
    return {
      status: 400,
      body: {
        message: 'Invalid request body'
      }
    }
  }

  // Validate that user can only request to speak for themselves
  if (userAddress !== targetUserAddress) {
    return {
      status: 403,
      body: {
        message: 'You can only request to speak for yourself'
      }
    }
  }

  // Check if community exists
  const communityExists = await communitiesDb.communityExists(communityId)
  if (!communityExists) {
    return {
      status: 404,
      body: {
        message: 'Community not found'
      }
    }
  }

  // Check if user is a member of the community
  const isMember = await communitiesDb.isMemberOfCommunity(communityId, targetUserAddress)
  if (!isMember) {
    return {
      status: 404,
      body: {
        message: 'Community not found'
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

  // Send request to comms-gatekeeper to update user metadata
  await commsGatekeeper.updateUserMetadataInCommunityVoiceChat(communityId, targetUserAddress, {
    isRequestingToSpeak: true
  })

  logger.info('User requested to speak in community voice chat', {
    communityId,
    userAddress: targetUserAddress
  })

  return {
    status: 200,
    body: {
      message: 'Request to speak sent successfully'
    }
  }
} 
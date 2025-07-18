import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'
import {
  AppComponents,
  CommunityVoiceChat,
  CommunityVoiceChatParticipant,
  CommunityRole,
  CommunityVoiceChatStatus
} from '../../types'
import { AnalyticsEvent } from '../../types/analytics'
import { isErrorWithMessage } from '../../utils/errors'
import {
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatPermissionError,
  UserNotCommunityMemberError,
  CommunityVoiceChatCreationError
} from './errors'
import { ICommunityVoiceComponent } from './types'
import { getProfileInfo } from '../profiles'

interface ProfileData {
  name: string
  hasClaimedName: boolean
  profilePictureUrl: string
}

export async function createCommunityVoiceComponent({
  logs,
  commsGatekeeper,
  communitiesDb,
  pubsub,
  analytics,
  catalystClient
}: Pick<
  AppComponents,
  'logs' | 'commsGatekeeper' | 'communitiesDb' | 'pubsub' | 'analytics' | 'catalystClient'
>): Promise<ICommunityVoiceComponent> {
  const logger = logs.getLogger('community-voice-logic')

  /**
   * Helper function to fetch and extract user profile data
   * @param userAddress - The address of the user to fetch profile for
   * @returns Profile data or null if fetch/extraction fails
   */
  async function getUserProfileData(userAddress: string): Promise<ProfileData | null> {
    try {
      const userProfile = await catalystClient.getProfile(userAddress)
      if (!userProfile) {
        logger.warn(`No profile found for user ${userAddress}`)
        return null
      }

      try {
        const { name, hasClaimedName, profilePictureUrl } = getProfileInfo(userProfile)
        return {
          name,
          hasClaimedName,
          profilePictureUrl
        }
      } catch (error) {
        logger.warn(
          `Failed to extract profile info for user ${userAddress}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
        )
        return null
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch profile for user ${userAddress}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      return null
    }
  }

  async function startCommunityVoiceChat(
    communityId: string,
    creatorAddress: string
  ): Promise<{ connectionUrl: string }> {
    logger.info(`Starting community voice chat for community ${communityId} by ${creatorAddress}`)

    // Check if user is member of the community
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, creatorAddress)

    if (userRole === CommunityRole.None) {
      throw new UserNotCommunityMemberError(creatorAddress, communityId)
    }

    // Check if user has permission to start voice chats (only owners and moderators)
    if (userRole !== CommunityRole.Owner && userRole !== CommunityRole.Moderator) {
      throw new CommunityVoiceChatPermissionError('Only community owners and moderators can start voice chats')
    }

    // Check if community already has an active voice chat
    const existingVoiceChat = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)

    if (existingVoiceChat?.isActive) {
      throw new CommunityVoiceChatAlreadyActiveError(communityId)
    }

    try {
      // Fetch user profile data using helper function
      const profileData = await getUserProfileData(creatorAddress)

      // Create room in comms-gatekeeper and get credentials directly
      const credentials = await commsGatekeeper.createCommunityVoiceChatRoom(communityId, creatorAddress, profileData)
      logger.info(`Community voice chat room created for community ${communityId}`)

      // Publish start event
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        status: 'started'
      })

      // Analytics event
      analytics.fireEvent(AnalyticsEvent.START_COMMUNITY_CALL, {
        call_id: communityId,
        user_id: creatorAddress
      })

      return credentials
    } catch (error) {
      logger.error(
        `Failed to create community voice chat room: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`,
        {
          errorStack: error instanceof Error ? error.stack || 'No stack trace' : 'Unknown',
          errorName: error instanceof Error ? error.constructor.name : 'Unknown',
          communityId,
          creatorAddress
        }
      )
      throw new CommunityVoiceChatCreationError(
        `Failed to start community voice chat: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
    }
  }

  async function joinCommunityVoiceChat(communityId: string, userAddress: string): Promise<{ connectionUrl: string }> {
    logger.info(`User ${userAddress} joining community voice chat for community ${communityId}`)

    // Get the active voice chat for the community
    const voiceChatStatus = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!voiceChatStatus?.isActive) {
      throw new CommunityVoiceChatNotFoundError(communityId)
    }

    // Get community information to check privacy setting
    const community = await communitiesDb.getCommunity(communityId, userAddress)
    if (!community) {
      throw new CommunityVoiceChatNotFoundError(communityId)
    }

    // For private communities, check if user is a member
    if (community.privacy === 'private') {
      const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)
      if (userRole === CommunityRole.None) {
        throw new UserNotCommunityMemberError(userAddress, communityId)
      }
    }

    // Fetch user profile data using helper function
    const profileData = await getUserProfileData(userAddress)

    // Get credentials from comms-gatekeeper with profile data
    const credentials = await commsGatekeeper.getCommunityVoiceChatCredentials(communityId, userAddress, profileData)

    return credentials
  }

  async function getCommunityVoiceChat(communityId: string): Promise<CommunityVoiceChat | null> {
    const status = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!status?.isActive) {
      return null
    }

    // Convert gatekeeper status to our CommunityVoiceChat format
    return {
      id: communityId,
      community_id: communityId,
      created_by: '', // We don't have this info from gatekeeper, but it's not critical
      created_at: new Date(), // Same here
      ended_at: undefined,
      status: CommunityVoiceChatStatus.ACTIVE
    }
  }

  async function getActiveCommunityVoiceChats(): Promise<CommunityVoiceChat[]> {
    // Note: This method would require the gatekeeper to have an endpoint to list all active community voice chats
    // For now, we'll return an empty array as this method might not be used frequently
    logger.warn('getActiveCommunityVoiceChats called but not implemented with gatekeeper delegation')
    return []
  }

  return {
    startCommunityVoiceChat,
    joinCommunityVoiceChat,
    getCommunityVoiceChat,
    getActiveCommunityVoiceChats
  }
}

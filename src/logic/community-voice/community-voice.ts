import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'
import {
  AppComponents,
  CommunityVoiceChat,
  CommunityVoiceChatParticipant,
  CommunityVoiceChatRole,
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

export async function createCommunityVoiceComponent({
  logs,
  commsGatekeeper,
  communitiesDb,
  pubsub,
  analytics
}: Pick<
  AppComponents,
  'logs' | 'commsGatekeeper' | 'communitiesDb' | 'pubsub' | 'analytics'
>): Promise<ICommunityVoiceComponent> {
  const logger = logs.getLogger('community-voice-logic')

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
      // Create room in comms-gatekeeper and get credentials directly
      const credentials = await commsGatekeeper.createCommunityVoiceChatRoom(communityId, creatorAddress)
      logger.info(`Community voice chat room created for community ${communityId}`)

      // Publish start event
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        voiceChatId: communityId,
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

  async function endCommunityVoiceChat(voiceChatId: string, userAddress: string): Promise<void> {
    logger.info(`Ending community voice chat ${voiceChatId} by ${userAddress}`)

    // In our new architecture, voiceChatId is the same as communityId
    const communityId = voiceChatId

    // Get current voice chat status
    const voiceChatStatus = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!voiceChatStatus?.isActive) {
      throw new CommunityVoiceChatNotFoundError(voiceChatId)
    }

    // Check if user has permission to end the voice chat
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)
    const canEnd = userRole === CommunityRole.Owner || userRole === CommunityRole.Moderator

    if (!canEnd) {
      throw new CommunityVoiceChatPermissionError('Only community owners or moderators can end voice chats')
    }

    // Note: Ending community voice chat is now handled directly by the client via LiveKit
    // We don't need to call the comms-gatekeeper here

    // Analytics event
    analytics.fireEvent(AnalyticsEvent.END_CALL, {
      call_id: voiceChatId
    })
  }

  async function joinCommunityVoiceChat(communityId: string, userAddress: string): Promise<{ connectionUrl: string }> {
    logger.info(`User ${userAddress} joining community voice chat for community ${communityId}`)

    // Get the active voice chat for the community
    const voiceChatStatus = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!voiceChatStatus?.isActive) {
      throw new CommunityVoiceChatNotFoundError(communityId)
    }

    // Check if user is member of the community (or if community is public)
    const community = await communitiesDb.getCommunity(communityId, userAddress)
    if (!community) {
      throw new UserNotCommunityMemberError(userAddress, communityId)
    }

    // Determine user role (listener by default for members, speaker for moderators/owners)
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)
    const voiceChatRole =
      userRole === CommunityRole.Owner || userRole === CommunityRole.Moderator
        ? CommunityVoiceChatRole.SPEAKER
        : CommunityVoiceChatRole.LISTENER

    // Get credentials from comms-gatekeeper
    const credentials = await commsGatekeeper.getCommunityVoiceChatCredentials(communityId, userAddress)

    return credentials
  }

  async function leaveCommunityVoiceChat(voiceChatId: string, userAddress: string): Promise<void> {
    logger.info(`User ${userAddress} leaving community voice chat ${voiceChatId}`)

    // In our new architecture, voiceChatId is the same as communityId
    const communityId = voiceChatId

    // Get current voice chat status
    const voiceChatStatus = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!voiceChatStatus?.isActive) {
      throw new CommunityVoiceChatNotFoundError(voiceChatId)
    }

    // Note: We delegate the participant check to the comms-gatekeeper
    // The gatekeeper will handle whether the user is actually in the voice chat

    // Note: No longer publishing leave events - only 'started' events are published
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

  async function getCommunityVoiceChatParticipants(voiceChatId: string): Promise<CommunityVoiceChatParticipant[]> {
    // In our new architecture, voiceChatId is the same as communityId
    const communityId = voiceChatId

    const status = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)
    if (!status?.isActive) {
      return []
    }
    // TODO: check if we need this
    return []
  }

  async function getActiveCommunityVoiceChats(): Promise<CommunityVoiceChat[]> {
    // Note: This method would require the gatekeeper to have an endpoint to list all active community voice chats
    // For now, we'll return an empty array as this method might not be used frequently
    logger.warn('getActiveCommunityVoiceChats called but not implemented with gatekeeper delegation')
    return []
  }

  return {
    startCommunityVoiceChat,
    endCommunityVoiceChat,
    joinCommunityVoiceChat,
    leaveCommunityVoiceChat,
    getCommunityVoiceChat,
    getCommunityVoiceChatParticipants,
    getActiveCommunityVoiceChats
  }
}

import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { AppComponents, CommunityVoiceChat, CommunityRole, CommunityVoiceChatStatus } from '../../types'
import { AnalyticsEvent } from '../../types/analytics'
import { isErrorWithMessage, errorMessageOrDefault } from '../../utils/errors'
import { separatePositionsAndWorlds } from '../../utils/places'
import { ActiveCommunityVoiceChat, CommunityPrivacyEnum } from '../community/types'
import { CommunityVoiceChatStatus as ProtocolCommunityVoiceChatStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import {
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatPermissionError,
  UserNotCommunityMemberError,
  CommunityVoiceChatCreationError,
  InvalidCommunityIdError,
  InvalidUserAddressError
} from './errors'
import { CommunityVoiceChatProfileData, ICommunityVoiceComponent } from './types'
import { getProfileInfo } from '../profiles'
import { ICommunityVoiceChatCacheComponent } from './community-voice-cache'

export async function createCommunityVoiceComponent({
  logs,
  commsGatekeeper,
  communitiesDb,
  pubsub,
  analytics,
  catalystClient,
  communityVoiceChatCache,
  placesApi,
  communityThumbnail,
  communityPlaces
}: Pick<
  AppComponents,
  | 'logs'
  | 'commsGatekeeper'
  | 'communitiesDb'
  | 'pubsub'
  | 'analytics'
  | 'catalystClient'
  | 'placesApi'
  | 'communityThumbnail'
  | 'communityPlaces'
> & {
  communityVoiceChatCache: ICommunityVoiceChatCacheComponent
}): Promise<ICommunityVoiceComponent> {
  const logger = logs.getLogger('community-voice-logic')

  /**
   * Helper function to fetch and extract user profile data
   * @param userAddress - The address of the user to fetch profile for
   * @returns Profile data or null if fetch/extraction fails
   */
  async function getUserProfileData(userAddress: string): Promise<CommunityVoiceChatProfileData | null> {
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
          has_claimed_name: hasClaimedName,
          profile_picture_url: profilePictureUrl
        }
      } catch (error) {
        logger.warn(
          `Failed to extract profile info for user ${userAddress}: ${
            isErrorWithMessage(error) ? error.message : 'Unknown error'
          }`
        )
        return null
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch profile for user ${userAddress}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
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
      const credentials = await commsGatekeeper.createCommunityVoiceChatRoom(
        communityId,
        creatorAddress,
        userRole,
        profileData
      )
      logger.info(`Community voice chat room created for community ${communityId}`)

      // Add to cache as active
      await communityVoiceChatCache.setCommunityVoiceChat(communityId, Date.now())

      // Get community information for the update
      let communityPositions: string[] = []
      let communityWorlds: string[] = []
      let communityName = ''
      let communityImage: string | undefined = undefined

      try {
        // Get community basic info and thumbnail
        const [community, thumbnail] = await Promise.all([
          communitiesDb.getCommunity(communityId),
          communityThumbnail.getThumbnail(communityId)
        ])

        if (community) {
          communityName = community.name
          communityImage = thumbnail || undefined
        }

        // Get community places and separate positions from worlds
        const places = await communitiesDb.getCommunityPlaces(communityId)
        const placeIds = places.map((place) => place.id)

        if (placeIds.length > 0) {
          const uniquePlaceIds = Array.from(new Set(placeIds))
          const placesData = await placesApi.getPlaces(uniquePlaceIds)

          if (placesData) {
            const { positions, worlds } = separatePositionsAndWorlds(placesData)
            communityPositions = positions
            communityWorlds = worlds

            logger.info(
              `Found ${communityPositions.length} positions and ${communityWorlds.length} worlds for community ${communityId} from ${uniquePlaceIds.length} places`,
              {
                placesCount: uniquePlaceIds.length,
                positionsCount: communityPositions.length,
                worldsCount: communityWorlds.length
              }
            )
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to fetch community information for community ${communityId}: ${
            isErrorWithMessage(error) ? error.message : 'Unknown error'
          }`
        )
        // Continue without community info - non-critical error
      }

      // Publish start event with community information using protocol enum
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        status: ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED,
        positions: communityPositions,
        worlds: communityWorlds,
        communityName,
        communityImage
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

    // Check if user is banned from the community (applies to both public and private communities)
    const isBanned = await communitiesDb.isMemberBanned(communityId, userAddress)
    if (isBanned) {
      throw new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
    }

    // Get the user's role in the community for both public and private communities
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)

    // For private communities, check if user is a member
    if (community.privacy === CommunityPrivacyEnum.Private) {
      if (userRole === CommunityRole.None) {
        throw new UserNotCommunityMemberError(userAddress, communityId)
      }
    }

    // Fetch user profile data using helper function
    const profileData = await getUserProfileData(userAddress)

    // Get credentials from comms-gatekeeper with profile data and user role
    const credentials = await commsGatekeeper.getCommunityVoiceChatCredentials(
      communityId,
      userAddress,
      userRole,
      profileData
    )

    // Analytics event
    analytics.fireEvent(AnalyticsEvent.JOIN_COMMUNITY_CALL, {
      call_id: communityId,
      user_id: userAddress
    })

    return credentials
  }

  async function endCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    logger.info(`Ending community voice chat for community ${communityId} by ${userAddress}`)

    // Check if user is member of the community
    const userRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)

    if (userRole === CommunityRole.None) {
      throw new UserNotCommunityMemberError(userAddress, communityId)
    }

    // Check if user has permission to end voice chats (only owners and moderators)
    if (userRole !== CommunityRole.Owner && userRole !== CommunityRole.Moderator) {
      throw new CommunityVoiceChatPermissionError('Only community owners and moderators can end voice chats')
    }

    // Check if community has an active voice chat
    const existingVoiceChat = await commsGatekeeper.getCommunityVoiceChatStatus(communityId)

    if (!existingVoiceChat?.isActive) {
      throw new CommunityVoiceChatNotFoundError(communityId)
    }

    try {
      // End the room in comms-gatekeeper (force end regardless of participants)
      await commsGatekeeper.endCommunityVoiceChatRoom(communityId, userAddress)
      logger.info(`Community voice chat room ended for community ${communityId}`)

      // Remove from cache
      await communityVoiceChatCache.removeCommunityVoiceChat(communityId)

      // Publish end event - we don't need community details for ENDED status
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        status: ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED,
        positions: undefined,
        worlds: undefined,
        communityName: undefined,
        communityImage: undefined
      })

      // Analytics event
      analytics.fireEvent(AnalyticsEvent.END_COMMUNITY_CALL, {
        call_id: communityId,
        user_id: userAddress
      })

      logger.info(`Community voice chat ended successfully for community ${communityId}`)
    } catch (error) {
      logger.error(
        `Failed to end community voice chat room: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`,
        {
          errorStack: error instanceof Error ? error.stack || 'No stack trace' : 'Unknown',
          errorName: error instanceof Error ? error.constructor.name : 'Unknown',
          communityId,
          userAddress
        }
      )
      throw error
    }
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

  async function getActiveCommunityVoiceChatsForUser(userAddress: string): Promise<ActiveCommunityVoiceChat[]> {
    try {
      // Get all active voice chats from comms-gatekeeper
      const activeChatsFromGatekeeper = await commsGatekeeper.getAllActiveCommunityVoiceChats()

      if (activeChatsFromGatekeeper.length === 0) {
        return []
      }

      // Extract community IDs from active chats
      const activeCommunityIds = activeChatsFromGatekeeper.map((chat) => chat.communityId)

      // Get detailed info for active communities with user membership in single efficient query
      const activeCommunitiesWithMembership = await communitiesDb.getCommunities(userAddress, {
        pagination: { offset: 0, limit: activeCommunityIds.length },
        onlyMemberOf: false,
        onlyWithActiveVoiceChat: false,
        communityIds: activeCommunityIds, // Filter by the active community IDs only
        includeUnlisted: true
      })

      // Create membership map for quick lookup
      const membershipMap = new Map(
        activeCommunitiesWithMembership.map((community) => [
          community.id,
          {
            isMember: community.role !== CommunityRole.None,
            privacy: community.privacy,
            name: community.name
          }
        ])
      )

      // Create voice chat status map for quick lookup
      const voiceChatStatusMap = new Map(
        activeChatsFromGatekeeper.map((chat) => [
          chat.communityId,
          {
            participantCount: chat.participantCount,
            moderatorCount: chat.moderatorCount
          }
        ])
      )

      // Process each active community
      const processedChats = await Promise.allSettled(
        activeCommunityIds.map(async (communityId): Promise<ActiveCommunityVoiceChat | null> => {
          const membership = membershipMap.get(communityId)
          const voiceChatStatus = voiceChatStatusMap.get(communityId)

          if (!membership || !voiceChatStatus) {
            return null
          }

          const { isMember, privacy, name: communityName } = membership
          const { participantCount, moderatorCount } = voiceChatStatus

          // Early privacy check: for non-members, only include public communities
          if (!isMember && privacy !== CommunityPrivacyEnum.Public) {
            return null
          }

          // For non-members, we need to check if community has positions/worlds
          // For members, we always include them regardless of positions
          let positions: string[] = []
          let worlds: string[] = []
          let communityImage: string | undefined

          const [placesResult, thumbnailResult] = await Promise.allSettled([
            // Only fetch places for non-members or when needed
            !isMember ? communityPlaces.getPlacesWithPositionsAndWorlds(communityId) : { positions: [], worlds: [] },
            // Fetch community thumbnail
            communityThumbnail.getThumbnail(communityId)
          ])

          // Extract positions and worlds from places result
          if (placesResult.status === 'fulfilled') {
            const { positions: separatedPositions, worlds: separatedWorlds } = placesResult.value
            positions = separatedPositions
            worlds = separatedWorlds
          } else {
            logger.warn(
              `Failed to fetch positions and worlds for community ${communityId}: ${errorMessageOrDefault(
                placesResult.reason
              )}`
            )
          }

          // Extract community image from thumbnail result
          if (thumbnailResult.status === 'fulfilled') {
            communityImage = thumbnailResult.value || undefined
          } else {
            logger.warn(
              `Failed to fetch thumbnail for community ${communityId}: ${errorMessageOrDefault(thumbnailResult.reason)}`
            )
          }

          // Filter logic:
          // - Include if user is a member (always)
          // - Include if user is NOT a member AND community is public AND has positions or worlds
          if (isMember || positions.length > 0 || worlds.length > 0) {
            return {
              communityId,
              participantCount,
              moderatorCount,
              isMember,
              communityName,
              communityImage,
              positions,
              worlds
            }
          }

          return null
        })
      )

      // Filter out null results and failed promises
      const filteredChats = processedChats
        .filter(
          (result): result is PromiseFulfilledResult<ActiveCommunityVoiceChat | null> =>
            result.status === 'fulfilled' && result.value !== null
        )
        .map((result) => result.value as ActiveCommunityVoiceChat)

      logger.info(`Retrieved ${filteredChats.length} active community voice chats for user ${userAddress}`)

      return filteredChats
    } catch (error) {
      logger.error(`Failed to get active community voice chats: ${errorMessageOrDefault(error)}`)
      throw error
    }
  }

  async function muteSpeakerInCommunityVoiceChat(
    communityId: string,
    targetUserAddress: string,
    actingUserAddress: string,
    muted: boolean
  ): Promise<void> {
    try {
      logger.info('Processing mute/unmute request', {
        communityId,
        targetUserAddress,
        actingUserAddress,
        muted: muted.toString()
      })

      const targetUserAddressLower = targetUserAddress.toLowerCase()
      const actingUserAddressLower = actingUserAddress.toLowerCase()

      // Validate community ID
      if (!communityId || communityId.trim() === '') {
        throw new InvalidCommunityIdError()
      }

      // Validate user address
      if (!targetUserAddressLower || targetUserAddressLower.trim() === '') {
        throw new InvalidUserAddressError()
      }

      // Check if it's a self-mute operation
      const isSelfMute = targetUserAddressLower === actingUserAddressLower

      if (!isSelfMute) {
        // Check permissions: only owners and moderators can mute/unmute other players
        const actingUserRole = await communitiesDb.getCommunityMemberRole(communityId, actingUserAddressLower)
        if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
          throw new CommunityVoiceChatPermissionError(
            'Only community owners, moderators, or the user themselves can mute/unmute speakers'
          )
        }

        logger.info('Permission check passed: moderator/owner muting player', {
          communityId,
          actingUserRole,
          targetUserAddress: targetUserAddressLower,
          actingUserAddress: actingUserAddressLower
        })
      } else {
        logger.info('Self-mute operation', {
          communityId,
          userAddress: targetUserAddressLower
        })
      }

      // Call the comms gatekeeper to perform the actual mute/unmute
      await commsGatekeeper.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddressLower, muted)

      const action = muted ? 'muted' : 'unmuted'
      logger.info(`Speaker ${action} successfully`, {
        communityId,
        targetUserAddress: targetUserAddressLower,
        actingUserAddress: actingUserAddressLower,
        muted: muted.toString()
      })

      // Analytics event
      analytics.fireEvent(AnalyticsEvent.MUTE_SPEAKER_IN_COMMUNITY_CALL, {
        call_id: communityId,
        user_id: actingUserAddress,
        target_user_id: targetUserAddress
      })
    } catch (error) {
      const errorMessage = errorMessageOrDefault(error)
      logger.error('Failed to mute/unmute speaker in community voice chat', {
        error: errorMessage,
        communityId,
        targetUserAddress,
        actingUserAddress,
        muted: muted.toString()
      })
      throw error
    }
  }

  return {
    startCommunityVoiceChat,
    endCommunityVoiceChat,
    joinCommunityVoiceChat,
    muteSpeakerInCommunityVoiceChat,
    getCommunityVoiceChat,
    getActiveCommunityVoiceChats,
    getActiveCommunityVoiceChatsForUser
  }
}

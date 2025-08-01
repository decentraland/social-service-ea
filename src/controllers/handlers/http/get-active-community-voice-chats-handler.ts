import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse, CommunityRole } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { AggregatedCommunityWithMemberAndFriendsData } from '../../../logic/community'
import { separatePositionsAndWorlds } from '../../../utils/places'

export interface ActiveCommunityVoiceChat {
  communityId: string
  communityName: string
  communityImage?: string
  isMember: boolean
  positions: string[]
  worlds: string[]
  participantCount: number
  moderatorCount: number
}

export interface ActiveCommunityVoiceChatsResponse {
  activeChats: ActiveCommunityVoiceChat[]
  total: number
}

export async function getActiveCommunityVoiceChatsHandler(
  context: Pick<
    HandlerContextWithPath<
      'logs' | 'communitiesDb' | 'commsGatekeeper' | 'placesApi' | 'communityThumbnail',
      '/v1/community-voice-chats/active'
    >,
    'components' | 'verification'
  > &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<ActiveCommunityVoiceChatsResponse>> {
  const {
    components: { logs, communitiesDb, commsGatekeeper, placesApi, communityThumbnail },
    verification
  } = context

  const logger = logs.getLogger('get-active-community-voice-chats-handler')
  const userAddress = verification!.auth.toLowerCase()

  logger.info(`Getting active community voice chats for user ${userAddress}`)

  try {
    const activeChatsFromGatekeeper = await commsGatekeeper.getAllActiveCommunityVoiceChats()

    if (activeChatsFromGatekeeper.length === 0) {
      return {
        status: 200,
        body: {
          data: {
            activeChats: [],
            total: 0
          }
        }
      }
    }

    // Extract community IDs from active chats
    const activeCommunityIds = activeChatsFromGatekeeper.map((chat) => chat.communityId)

    // Get detailed info for active communities with user membership in single efficient query
    const activeCommunitiesWithMembership = await communitiesDb.getCommunities(userAddress, {
      pagination: { offset: 0, limit: activeCommunityIds.length },
      onlyMemberOf: false,
      onlyWithActiveVoiceChat: false,
      communityIds: activeCommunityIds // Filter by the active community IDs only
    })

    // Create membership map for quick lookup
    const membershipMap = new Map(
      activeCommunitiesWithMembership.map(
        (community: Pick<AggregatedCommunityWithMemberAndFriendsData, 'id' | 'role' | 'privacy' | 'name'>) => [
          community.id,
          {
            isMember: community.role !== CommunityRole.None,
            privacy: community.privacy,
            name: community.name
          }
        ]
      )
    )

    // Create voice chat status map for quick lookup
    const voiceChatStatusMap = new Map(activeChatsFromGatekeeper.map((chat) => [chat.communityId, chat]))

    // Prepare active chats data
    const activeChatsPromises = activeCommunityIds.map(async (communityId) => {
      const communityInfo = membershipMap.get(communityId)
      const voiceChatStatus = voiceChatStatusMap.get(communityId)

      // Skip if community info not found (shouldn't happen but safety check)
      if (!communityInfo || !voiceChatStatus) {
        return null
      }

      const { isMember, privacy, name: communityName } = communityInfo

      // Early privacy check: if user is not a member and community is private, skip entirely
      if (!isMember && privacy === 'private') {
        return null // Skip private communities for non-members to avoid unnecessary API calls
      }

      // 🚀 Fetch places/positions and thumbnail in parallel for better performance
      let positions: string[] = []
      let worlds: string[] = []
      let communityImage: string | undefined

      const [placesResult, thumbnailResult] = await Promise.allSettled([
        // Fetch places and positions/worlds
        (async () => {
          const places = await communitiesDb.getCommunityPlaces(communityId)
          const placeIds = places.map((place) => place.id)

          if (placeIds.length > 0) {
            const uniquePlaceIds = Array.from(new Set(placeIds))
            const placesData = await placesApi.getPlaces(uniquePlaceIds)

            if (placesData) {
              return separatePositionsAndWorlds(placesData)
            }
          }

          return { positions: [], worlds: [] }
        })(),

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
          `Failed to fetch positions and worlds for community ${communityId}: ${errorMessageOrDefault(placesResult.reason)}`
        )
        // Continue without positions/worlds - non-critical error
      }

      // Extract thumbnail from thumbnail result
      if (thumbnailResult.status === 'fulfilled') {
        communityImage = thumbnailResult.value || undefined
      } else {
        logger.warn(
          `Failed to fetch thumbnail for community ${communityId}: ${errorMessageOrDefault(thumbnailResult.reason)}`
        )
        // Continue without image - non-critical error
      }

      const activeChat: ActiveCommunityVoiceChat = {
        communityId,
        communityName,
        communityImage,
        isMember,
        positions,
        worlds,
        participantCount: voiceChatStatus.participantCount,
        moderatorCount: voiceChatStatus.moderatorCount
      }

      return activeChat
    })

    const activeChatsResults = await Promise.all(activeChatsPromises)
    const activeChats = activeChatsResults.filter((chat): chat is ActiveCommunityVoiceChat => chat !== null)

    // Filter results based on requirements:
    // - Include if user is a member (any privacy)
    // - Include if user is NOT a member but community is PUBLIC and has places (positions or worlds)
    // Note: Private communities for non-members are already filtered out earlier
    const filteredChats = activeChats.filter((chat) => {
      if (chat.isMember) {
        // Always include if user is a member
        return true
      } else {
        // For non-members in public communities: only include if has places
        return chat.positions.length > 0 || chat.worlds.length > 0
      }
    })

    logger.info(
      `Found ${filteredChats.length} relevant active community voice chats for user ${userAddress} ` +
        `(${filteredChats.filter((c) => c.isMember).length} as member, ` +
        `${filteredChats.filter((c) => !c.isMember).length} as non-member in public communities with positions/worlds)`
    )

    return {
      status: 200,
      body: {
        data: {
          activeChats: filteredChats,
          total: filteredChats.length
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting active community voice chats: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

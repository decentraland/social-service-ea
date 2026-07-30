import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { AppComponents } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  BannedMember,
  BannedMemberProfile,
  BannedMemberV2,
  ICommunityBansComponent,
  CommunityPrivacyEnum
} from './types'
import { mapMembersWithProfiles, mapMembersWithFriendshipStatus } from './utils'
import { EthAddress, Events, PaginatedParameters } from '@dcl/schemas'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { AnalyticsEvent } from '../../types/analytics'

export async function createCommunityBansComponent(
  components: Pick<
    AppComponents,
    | 'communitiesDb'
    | 'registry'
    | 'communityRoles'
    | 'communityThumbnail'
    | 'communityBroadcaster'
    | 'logs'
    | 'pubsub'
    | 'commsGatekeeper'
    | 'analytics'
  >
): Promise<ICommunityBansComponent> {
  const {
    communitiesDb,
    registry,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    pubsub,
    commsGatekeeper,
    analytics
  } = components

  const logger = logs.getLogger('community-bans-component')

  /**
   * Shared base fetch for the banned members endpoints. Validates the community exists
   * and the caller's permission, then reads the banned members from the database WITHOUT
   * any profile enrichment.
   */
  const fetchBannedMembers = async (
    id: string,
    userAddress: EthAddress,
    pagination: Required<PaginatedParameters>
  ): Promise<{ members: BannedMember[]; totalMembers: number }> => {
    const community = await communitiesDb.getCommunity(id)

    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    await communityRoles.validatePermissionToGetBannedMembers(id, userAddress)

    const bannedMembers = await communitiesDb.getBannedMembers(id, userAddress, pagination)
    const totalBannedMembers = await communitiesDb.getBannedMembersCount(id)

    return { members: bannedMembers, totalMembers: totalBannedMembers }
  }

  return {
    banMember: async (communityId: string, bannerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const community = await communitiesDb.getCommunity(communityId)

      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToBanMemberFromCommunity(communityId, bannerAddress, targetAddress)

      const doesTargetUserBelongsToCommunity = await communitiesDb.isMemberOfCommunity(communityId, targetAddress)

      if (doesTargetUserBelongsToCommunity) {
        await communitiesDb.kickMemberFromCommunity(communityId, targetAddress)

        await communitiesDb.unlikePostsFromCommunity(communityId, targetAddress)

        analytics.fireEvent(AnalyticsEvent.BAN_MEMBER_FROM_COMMUNITY, {
          community_id: communityId,
          banner_user_id: bannerAddress.toLowerCase(),
          target_user_id: targetAddress.toLowerCase()
        })
      }

      await communitiesDb.banMemberFromCommunity(communityId, bannerAddress, targetAddress)

      // Remove any pending join requests/invites so the ban cannot be circumvented by later accepting them.
      await communitiesDb.removeMemberRequests(communityId, targetAddress)

      // For private communities, also kick user from voice chat if they are in one
      if (community.privacy === CommunityPrivacyEnum.Private) {
        // Only for private communities
        try {
          await commsGatekeeper.kickUserFromCommunityVoiceChat(communityId, targetAddress)
          logger.info(`Kicked user ${targetAddress} from voice chat in private community ${communityId} during ban`)
        } catch (error) {
          logger.warn(`Failed to kick user ${targetAddress} from voice chat in community ${communityId} during ban`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress: targetAddress,
        status: ConnectivityStatus.OFFLINE
      })

      const timestamp = Date.now()
      void communityBroadcaster.broadcast({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.MEMBER_BANNED,
        key: `${communityId}-${targetAddress}-${timestamp}`,
        timestamp,
        metadata: {
          id: communityId,
          name: community.name,
          memberAddress: targetAddress,
          thumbnailUrl: communityThumbnail.buildThumbnailUrl(communityId)
        }
      })
    },

    unbanMember: async (communityId: string, unbannerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToUnbanMemberFromCommunity(communityId, unbannerAddress, targetAddress)

      const isBanned = await communitiesDb.isMemberBanned(communityId, targetAddress)

      if (!isBanned) {
        logger.info(`Target ${targetAddress} is not banned from community ${communityId}, returning 204`)
        return
      }

      await communitiesDb.unbanMemberFromCommunity(communityId, unbannerAddress, targetAddress)
    },

    getBannedMembers: async (
      id: string,
      userAddress: EthAddress,
      pagination: Required<PaginatedParameters>
    ): Promise<{ members: BannedMemberProfile[]; totalMembers: number }> => {
      const { members, totalMembers } = await fetchBannedMembers(id, userAddress, pagination)

      const profiles = await registry.getProfiles(members.map((member) => member.memberAddress))
      const membersWithProfile = mapMembersWithProfiles(userAddress, members, profiles)

      return { members: membersWithProfile, totalMembers }
    },

    getBannedMembersWithoutProfiles: async (
      id: string,
      userAddress: EthAddress,
      pagination: Required<PaginatedParameters>
    ): Promise<{ members: BannedMemberV2[]; totalMembers: number }> => {
      const { members, totalMembers } = await fetchBannedMembers(id, userAddress, pagination)

      return { members: mapMembersWithFriendshipStatus(userAddress, members), totalMembers }
    }
  }
}

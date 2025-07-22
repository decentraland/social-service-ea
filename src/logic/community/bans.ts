import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { AppComponents } from '../../types'
import { CommunityNotFoundError } from './errors'
import { BannedMemberProfile, BannedMember, ICommunityBansComponent } from './types'
import { mapMembersWithProfiles } from './utils'
import { EthAddress, Events, PaginatedParameters } from '@dcl/schemas'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../adapters/pubsub'

export async function createCommunityBansComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'catalystClient' | 'communityRoles' | 'logs' | 'pubsub' | 'sns'>
): Promise<ICommunityBansComponent> {
  const { communitiesDb, catalystClient, communityRoles, logs, pubsub, sns } = components

  const logger = logs.getLogger('community-bans-component')

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
      }

      await communitiesDb.banMemberFromCommunity(communityId, bannerAddress, targetAddress)

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress: targetAddress,
        status: ConnectivityStatus.OFFLINE
      })

      const timestamp = Date.now()
      await sns.publishMessage({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.MEMBER_BANNED,
        key: `${communityId}-${targetAddress}-${timestamp}`,
        timestamp,
        metadata: {
          id: communityId,
          name: community.name,
          memberAddress: targetAddress
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
      const communityExists = await communitiesDb.communityExists(id)

      if (!communityExists) {
        throw new CommunityNotFoundError(id)
      }

      await communityRoles.validatePermissionToGetBannedMembers(id, userAddress)

      const bannedMembers = await communitiesDb.getBannedMembers(id, userAddress, pagination)
      const totalBannedMembers = await communitiesDb.getBannedMembersCount(id)

      const profiles = await catalystClient.getProfiles(bannedMembers.map((member) => member.memberAddress))
      const membersWithProfile: BannedMemberProfile[] = mapMembersWithProfiles<BannedMember, BannedMemberProfile>(
        userAddress,
        bannedMembers,
        profiles
      )

      return { members: membersWithProfile, totalMembers: totalBannedMembers }
    }
  }
}

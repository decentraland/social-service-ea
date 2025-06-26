import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  CommunityMemberProfile,
  CommunityMember,
  GetCommunityMembersOptions,
  ICommunityMembersComponent
} from './types'
import { mapMembersWithProfiles } from './utils'
import { EthAddress } from '@dcl/schemas'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export async function createCommunityMembersComponent(
  components: Pick<
    AppComponents,
    'communitiesDb' | 'catalystClient' | 'communityRoles' | 'logs' | 'peersStats' | 'pubsub'
  >
): Promise<ICommunityMembersComponent> {
  const { communitiesDb, catalystClient, communityRoles, logs, peersStats, pubsub } = components

  const logger = logs.getLogger('community-component')

  const filterAndCountCommunityMembers = async (
    id: string,
    options: GetCommunityMembersOptions,
    userAddress?: EthAddress
  ) => {
    const { pagination, onlyOnline } = options
    const communityExists = await communitiesDb.communityExists(id, { onlyPublic: !userAddress })

    if (!communityExists) {
      throw new CommunityNotFoundError(id)
    }

    const community = await communitiesDb.getCommunity(id)
    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    const memberRole =
      community.privacy === 'private' && userAddress
        ? await communitiesDb.getCommunityMemberRole(id, userAddress)
        : CommunityRole.None

    if (community.privacy === 'private' && userAddress && memberRole === CommunityRole.None) {
      throw new NotAuthorizedError("The user doesn't have permission to get community members")
    }

    let onlinePeers: string[] | undefined = undefined

    if (onlyOnline) {
      onlinePeers = await peersStats.getConnectedPeers()
      logger.info(`Getting community members for community using the ${onlinePeers.length} connected peers`)
    }

    const communityMembers = await communitiesDb.getCommunityMembers(id, {
      userAddress,
      pagination,
      filterByMembers: onlinePeers
    })
    const totalMembers = await communitiesDb.getCommunityMembersCount(id, { filterByMembers: onlinePeers })

    const profiles = await catalystClient.getProfiles(communityMembers.map((member) => member.memberAddress))

    const membersWithProfile: CommunityMemberProfile[] = mapMembersWithProfiles<
      CommunityMember,
      CommunityMemberProfile
    >(userAddress, communityMembers, profiles)

    return { members: membersWithProfile, totalMembers }
  }

  return {
    getCommunityMembers: async (
      id: string,
      userAddress: EthAddress,
      options: GetCommunityMembersOptions
    ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }> => {
      return filterAndCountCommunityMembers(id, options, userAddress)
    },

    getMembersFromPublicCommunity: async (
      id: string,
      options: GetCommunityMembersOptions
    ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }> => {
      return filterAndCountCommunityMembers(id, options)
    },

    async *getOnlineMembersFromUserCommunities(
      userAddress: string,
      onlineUsers: string[],
      batchSize: number = 100
    ): AsyncGenerator<Array<{ communityId: string; memberAddress: string }>> {
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const batch = await communitiesDb.getOnlineMembersFromUserCommunities(userAddress, onlineUsers, {
          limit: batchSize,
          offset
        })

        if (batch.length === 0) break

        yield batch
        offset += batchSize
        hasMore = batch.length === batchSize
      }
    },

    kickMember: async (communityId: string, kickerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const doesTargetUserBelongsToCommunity = await communitiesDb.isMemberOfCommunity(communityId, targetAddress)

      if (!doesTargetUserBelongsToCommunity) {
        logger.info(`Target ${targetAddress} is not a member of community ${communityId}, returning 204`)
        return
      }

      await communityRoles.validatePermissionToKickMemberFromCommunity(communityId, kickerAddress, targetAddress)

      await communitiesDb.kickMemberFromCommunity(communityId, targetAddress)

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress: targetAddress,
        status: ConnectivityStatus.OFFLINE
      })
    },

    joinCommunity: async (communityId: string, memberAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const isAlreadyMember = await communitiesDb.isMemberOfCommunity(communityId, memberAddress)

      if (isAlreadyMember) {
        logger.info(`User ${memberAddress} is already a member of community ${communityId}, returning 204`)
        return
      }

      const isBanned = await communitiesDb.isMemberBanned(communityId, memberAddress)

      if (isBanned) {
        throw new NotAuthorizedError(`The user ${memberAddress} is banned from community ${communityId}`)
      }

      await communitiesDb.addCommunityMember({
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress,
        status: ConnectivityStatus.ONLINE
      })
    },

    leaveCommunity: async (communityId: string, memberAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const isMember = await communitiesDb.isMemberOfCommunity(communityId, memberAddress)

      if (!isMember) {
        logger.info(`User ${memberAddress} is not a member of community ${communityId}, returning 204`)
        return
      }

      await communityRoles.validatePermissionToLeaveCommunity(communityId, memberAddress)

      await communitiesDb.kickMemberFromCommunity(communityId, memberAddress)

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress,
        status: ConnectivityStatus.OFFLINE
      })
    },

    updateMemberRole: async (
      communityId: string,
      updaterAddress: EthAddress,
      targetAddress: EthAddress,
      newRole: CommunityRole
    ): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

      await communitiesDb.updateMemberRole(communityId, targetAddress, newRole)
    }
  }
}

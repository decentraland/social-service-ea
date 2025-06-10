import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  CommunityWithUserInformation,
  GetCommunitiesOptions,
  GetCommunitiesWithTotal,
  ICommunityComponent,
  CommunityPublicInformation,
  CommunityWithMembersCount,
  CommunityMemberProfile,
  MemberCommunity,
  Community,
  BannedMemberProfile,
  BannedMember,
  CommunityMember,
  GetCommunityMembersOptions
} from './types'
import {
  isOwner,
  toCommunityWithMembersCount,
  toCommunityResults,
  toPublicCommunity,
  mapMembersWithProfiles
} from './utils'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'

export function createCommunityComponent(
  components: Pick<
    AppComponents,
    'communitiesDb' | 'catalystClient' | 'communityRoles' | 'logs' | 'peersStats' | 'storage'
  >
): ICommunityComponent {
  const { communitiesDb, catalystClient, communityRoles, logs, peersStats, storage } = components

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

    const memberRole = userAddress ? await communitiesDb.getCommunityMemberRole(id, userAddress) : CommunityRole.None

    if (userAddress && memberRole === CommunityRole.None) {
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
    getCommunity: async (id: string, userAddress: EthAddress): Promise<CommunityWithMembersCount> => {
      const [community, membersCount] = await Promise.all([
        communitiesDb.getCommunity(id, userAddress),
        communitiesDb.getCommunityMembersCount(id)
      ])

      if (!community) {
        throw new CommunityNotFoundError(id)
      }

      return toCommunityWithMembersCount(community, membersCount)
    },

    getCommunities: async (
      userAddress: string,
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunities(userAddress, options),
        communitiesDb.getCommunitiesCount(userAddress, options)
      ])
      const friendsAddresses = Array.from(new Set(communities.flatMap((community) => community.friends)))
      const friendsProfiles = await catalystClient.getProfiles(friendsAddresses)
      return {
        communities: toCommunityResults(communities, friendsProfiles),
        total
      }
    },

    getCommunitiesPublicInformation: async (
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityPublicInformation>> => {
      const { search } = options
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunitiesPublicInformation(options),
        communitiesDb.getPublicCommunitiesCount({ search })
      ])

      return {
        communities: communities.map(toPublicCommunity),
        total
      }
    },

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

    getMemberCommunities: async (
      memberAddress: string,
      options: Pick<GetCommunitiesOptions, 'pagination'>
    ): Promise<GetCommunitiesWithTotal<MemberCommunity>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getMemberCommunities(memberAddress, options),
        communitiesDb.getCommunitiesCount(memberAddress, { onlyMemberOf: true })
      ])
      return { communities, total }
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

      const canKick = await communityRoles.canKickMemberFromCommunity(communityId, kickerAddress, targetAddress)

      if (!canKick) {
        throw new NotAuthorizedError(
          `The user ${kickerAddress} doesn't have permission to kick ${targetAddress} from community ${communityId}`
        )
      }

      await communitiesDb.kickMemberFromCommunity(communityId, targetAddress)
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

      await communitiesDb.addCommunityMember({
        communityId,
        memberAddress,
        role: CommunityRole.Member
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

      const memberRole = await communitiesDb.getCommunityMemberRole(communityId, memberAddress)

      // Owners cannot leave their communities
      if (memberRole === CommunityRole.Owner) {
        throw new NotAuthorizedError(`The owner cannot leave the community ${communityId}`)
      }

      await communitiesDb.kickMemberFromCommunity(communityId, memberAddress)
    },

    createCommunity: async (
      community: Omit<Community, 'id' | 'active' | 'privacy' | 'thumbnails'>,
      thumbnail?: Buffer
    ): Promise<Community> => {
      const ownedNames = await catalystClient.getOwnedNames(community.ownerAddress, {
        pageSize: '1'
      })

      if (ownedNames.length === 0) {
        throw new NotAuthorizedError(`The user ${community.ownerAddress} doesn't have any names`)
      }

      const newCommunity = await communitiesDb.createCommunity({
        ...community,
        owner_address: community.ownerAddress,
        private: false, // TODO: support private communities
        active: true
      })

      logger.info('Community created', { communityId: newCommunity.id, name: newCommunity.name })

      if (thumbnail) {
        const thumbnailUrl = await storage.storeFile(thumbnail, `communities/${newCommunity.id}/raw-thumbnail.png`)

        logger.info('Thumbnail stored', { thumbnailUrl, communityId: newCommunity.id })
      }

      await communitiesDb.addCommunityMember({
        communityId: newCommunity.id,
        memberAddress: community.ownerAddress,
        role: CommunityRole.Owner
      })

      return newCommunity
    },

    deleteCommunity: async (id: string, userAddress: string): Promise<void> => {
      const community = await communitiesDb.getCommunity(id, userAddress)

      if (!community) {
        throw new CommunityNotFoundError(id)
      }

      if (!isOwner(community, userAddress)) {
        throw new NotAuthorizedError("The user doesn't have permission to delete this community")
      }

      await communitiesDb.deleteCommunity(id)
    },

    banMember: async (communityId: string, bannerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const canBan = await communityRoles.canBanMemberFromCommunity(communityId, bannerAddress, targetAddress)

      if (!canBan) {
        throw new NotAuthorizedError(
          `The user ${bannerAddress} doesn't have permission to ban ${targetAddress} from community ${communityId}`
        )
      }

      const doesTargetUserBelongsToCommunity = await communitiesDb.isMemberOfCommunity(communityId, targetAddress)

      if (doesTargetUserBelongsToCommunity) {
        await communitiesDb.kickMemberFromCommunity(communityId, targetAddress)
      }

      await communitiesDb.banMemberFromCommunity(communityId, bannerAddress, targetAddress)
    },

    unbanMember: async (communityId: string, unbannerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const canUnban = await communityRoles.canUnbanMemberFromCommunity(communityId, unbannerAddress, targetAddress)

      if (!canUnban) {
        throw new NotAuthorizedError(
          `The user ${unbannerAddress} doesn't have permission to unban ${targetAddress} from community ${communityId}`
        )
      }

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

      const memberRole = await communitiesDb.getCommunityMemberRole(id, userAddress)

      if (!memberRole || !communityRoles.hasPermission(memberRole, 'ban_players')) {
        throw new NotAuthorizedError("The user doesn't have permission to get banned members")
      }

      const bannedMembers = await communitiesDb.getBannedMembers(id, userAddress, pagination)
      const totalBannedMembers = await communitiesDb.getBannedMembersCount(id)

      const profiles = await catalystClient.getProfiles(bannedMembers.map((member) => member.memberAddress))
      const membersWithProfile: BannedMemberProfile[] = mapMembersWithProfiles<BannedMember, BannedMemberProfile>(
        userAddress,
        bannedMembers,
        profiles
      )

      return { members: membersWithProfile, totalMembers: totalBannedMembers }
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

      const canUpdate = await communityRoles.canUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

      if (!canUpdate) {
        throw new NotAuthorizedError(
          `The user ${updaterAddress} doesn't have permission to update ${targetAddress}'s role in community ${communityId}`
        )
      }

      await communitiesDb.updateMemberRole(communityId, targetAddress, newRole)
    }
  }
}

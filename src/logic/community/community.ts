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
  Community
} from './types'
import { isOwner, toCommunityWithMembersCount, toCommunityResults, toPublicCommunity } from './utils'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'
import { getProfileHasClaimedName, getProfileName } from '../profiles'

export function createCommunityComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'catalystClient' | 'communityRoles' | 'logs'>
): ICommunityComponent {
  const { communitiesDb, catalystClient, communityRoles, logs } = components

  const logger = logs.getLogger('community-component')

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
      pagination: Required<PaginatedParameters>
    ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }> => {
      const communityExists = await communitiesDb.communityExists(id)

      if (!communityExists) {
        throw new CommunityNotFoundError(id)
      }

      const memberRole = await communitiesDb.getCommunityMemberRole(id, userAddress)

      if (memberRole === CommunityRole.None) {
        throw new NotAuthorizedError("The user doesn't have permission to get community members")
      }

      const communityMembers = await communitiesDb.getCommunityMembers(id, pagination)
      const totalMembers = await communitiesDb.getCommunityMembersCount(id)

      const profiles = await catalystClient.getProfiles(communityMembers.map((member) => member.memberAddress))

      const membersWithProfile: CommunityMemberProfile[] = communityMembers
        .map((communityMember) => {
          const memberProfile = profiles.find(
            (profile) => profile.avatars?.[0]?.ethAddress?.toLowerCase() === communityMember.memberAddress.toLowerCase()
          )

          if (!memberProfile) {
            return undefined
          }

          return {
            ...communityMember,
            hasClaimedName: getProfileHasClaimedName(memberProfile),
            name: getProfileName(memberProfile)
          }
        })
        .filter((member: CommunityMemberProfile | undefined): member is CommunityMemberProfile => member !== undefined)

      return { members: membersWithProfile, totalMembers }
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

      const isTargetMember = await communitiesDb.isMemberOfCommunity(communityId, targetAddress)

      if (!isTargetMember) {
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

    createCommunity: async (community: Omit<Community, 'id' | 'active' | 'privacy'>): Promise<Community> => {
      const newCommunity = await communitiesDb.createCommunity({
        ...community,
        owner_address: community.ownerAddress,
        private: false, // TODO: support private communities
        active: true
      })

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
    }
  }
}

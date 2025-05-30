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
  CommunityMemberProfile
} from './types'
import { isOwner, toCommunityWithMembersCount, toCommunityResults, toPublicCommunity } from './utils'
import { PaginatedParameters } from '@dcl/schemas'

export function createCommunityComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'catalystClient'>
): ICommunityComponent {
  const { communitiesDb, catalystClient } = components

  return {
    getCommunity: async (id: string, userAddress: string): Promise<CommunityWithMembersCount> => {
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
      { pagination, search }: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunities(userAddress, { pagination, search }),
        communitiesDb.getCommunitiesCount(userAddress, { search })
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

    getCommunityMembers: async (
      id: string,
      userAddress: string,
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

      const membersWithProfile: CommunityMemberProfile[] = communityMembers.map((communityMember) => {
        const memberProfile = profiles.find(
          (profile) => profile.avatars?.[0]?.ethAddress?.toLowerCase() === communityMember.memberAddress.toLowerCase()
        )

        if (!memberProfile || !memberProfile.avatars?.[0]) {
          return {
            ...communityMember,
            hasClaimedName: false,
            name: ''
          }
        }

        const avatar = memberProfile.avatars[0]
        return {
          ...communityMember,
          hasClaimedName: !!avatar.hasClaimedName,
          name: avatar.name || avatar.unclaimedName || ''
        }
      })

      return { members: membersWithProfile, totalMembers }
    }
  }
}

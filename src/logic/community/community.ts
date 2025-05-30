import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  CommunityResult,
  GetCommunitiesOptions,
  GetCommunitiesResult,
  ICommunityComponent,
  PublicCommunity
} from './types'
import { isOwner, toCommunityWithMembersCount, toCommunityResults, toPublicCommunity } from './utils'

export function createCommunityComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'catalystClient'>
): ICommunityComponent {
  const { communitiesDb, catalystClient } = components

  return {
    getCommunity: async (id: string, userAddress: string) => {
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
    ): Promise<GetCommunitiesResult<CommunityResult>> => {
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

    getPublicCommunities: async (options: GetCommunitiesOptions): Promise<GetCommunitiesResult<PublicCommunity>> => {
      const { search } = options
      const [communities, total] = await Promise.all([
        communitiesDb.getPublicCommunities(options),
        communitiesDb.getPublicCommunitiesCount({ search })
      ])

      return {
        communities: communities.map(toPublicCommunity),
        total
      }
    },

    deleteCommunity: async (id: string, userAddress: string) => {
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

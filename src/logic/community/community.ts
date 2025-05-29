import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents } from '../../types'
import { CommunityNotFoundError } from './errors'
import { ICommunityComponent } from './types'
import { isOwner, toCommunityWithMembersCount } from './utils'

export function createCommunityComponent(components: Pick<AppComponents, 'communitiesDb'>): ICommunityComponent {
  const { communitiesDb } = components

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

import { PaginatedParameters } from '@dcl/schemas'
import { AppComponents, CommunityMember, ICommunityMembersComponent } from '../types'

export function createCommunityMembersComponent(
  components: Pick<AppComponents, 'communitiesDb'>
): ICommunityMembersComponent {
  const { communitiesDb } = components

  async function getCommunityMembers(
    communityId: string,
    pagination?: Required<PaginatedParameters>
  ): Promise<{ totalMembers: number; members: CommunityMember[] } | undefined> {
    const communityExists = await communitiesDb.communityExists(communityId)
    if (!communityExists) {
      return undefined
    }

    const totalMembers = await communitiesDb.getCommunityMembersCount(communityId)
    const members = await communitiesDb.getCommunityMembers(communityId, pagination)

    return { totalMembers, members }
  }

  return {
    getCommunityMembers
  }
}

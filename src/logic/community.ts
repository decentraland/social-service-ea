import { Community, CommunityWithMembersCount } from '../types'

export const toCommunityWithMembersCount = (community: Community, membersCount: number): CommunityWithMembersCount => {
  return {
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount: Number(membersCount)
  }
}

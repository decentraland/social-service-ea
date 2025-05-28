import { Community, CommunityWithMembersCount } from '../types'

export const isOwner = (community: Community, userAddress: string) => {
  return community.ownerAddress.toLowerCase() === userAddress.toLowerCase()
}

export const toCommunityWithMembersCount = (community: Community, membersCount: number): CommunityWithMembersCount => {
  return {
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount: Number(membersCount)
  }
}

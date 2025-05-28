import { Community } from '../types'

export type CommunityResult = {
  id: string
  name: string
  description: string
  ownerAddress: string
  privacy: 'public' | 'private'
  active: boolean
  membersCount: number
}

export const toCommunityWithMembersCount = (community: Community, membersCount: number): CommunityResult => {
  return {
    ...community,
    membersCount
  }
}

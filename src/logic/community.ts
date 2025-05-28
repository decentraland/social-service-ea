import { Community } from '../types'

export type CommunityResult = {
  id: string
  name: string
  description: string
  ownerAddress: string
  privacy: 'public' | 'private'
  active: boolean
  places: string[]
  membersCount: number
}

export const fromDBCommunity = (community: Community, places: string[], membersCount: number): CommunityResult => {
  return {
    ...community,
    places,
    membersCount
  }
}

import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, Pagination } from '../../types/entities'

export type ICommunityComponent = {
  getCommunity: (id: string, userAddress: string) => Promise<CommunityWithMembersCount>
  getCommunities: (userAddress: string, options: GetCommunitiesOptions) => Promise<GetCommunitiesResult>
  deleteCommunity: (id: string, userAddress: string) => Promise<void>
}

export type CommunityDB = {
  id?: string
  name: string
  description: string
  owner_address: string
  private: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export type Community = {
  id: string
  thumbnails?: Record<string, string>
  name: string
  description: string
  ownerAddress: string
  role: CommunityRole
  privacy: 'public' | 'private'
  active: boolean
}

export type CommunityWithMembersCount = Community & {
  membersCount: number
}

export type CommunityWithMembersCountAndFriends = CommunityWithMembersCount & {
  friends: string[]
}

export type GetCommunitiesOptions = {
  pagination: Pagination
  search?: string | null
}

export type CommunityResult = CommunityWithMembersCount & {
  friends: FriendProfile[]
  isLive: boolean
}

export type GetCommunitiesResult = {
  communities: CommunityResult[]
  total: number
}

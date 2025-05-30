import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, Pagination } from '../../types/entities'
import { PaginatedParameters } from '@dcl/schemas'

export type ICommunityComponent = {
  getCommunity: (id: string, userAddress: string) => Promise<CommunityWithMembersCount>
  getCommunities: (
    userAddress: string,
    options: GetCommunitiesOptions
  ) => Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>>
  getCommunitiesPublicInformation: (
    options: GetCommunitiesOptions
  ) => Promise<GetCommunitiesWithTotal<CommunityPublicInformation>>
  deleteCommunity: (id: string, userAddress: string) => Promise<void>
  getCommunityMembers: (
    id: string,
    userAddress: string,
    pagination: Required<PaginatedParameters>
  ) => Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
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

export type CommunityMember = {
  communityId: string
  memberAddress: string
  role: CommunityRole
  joinedAt: string
}

export type CommunityMemberProfile = CommunityMember & {
  hasClaimedName: boolean
  name: string
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
  onlyPublic?: boolean
  sortBy?: 'membersCount'
}

export type CommunityWithUserInformation = CommunityWithMembersCount & {
  friends: FriendProfile[]
  isLive: boolean
}

export type CommunityPublicInformation = Omit<CommunityWithUserInformation, 'role' | 'friends' | 'privacy'> & {
  privacy: 'public'
}

export type GetCommunitiesWithTotal<T> = {
  communities: T[]
  total: number
}

export type GetCommunityMembersResult = {
  results: CommunityMember[]
  total: number
  page: number
  pages: number
  limit: number
}

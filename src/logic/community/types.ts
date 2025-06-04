import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, Pagination, CommunityPermission } from '../../types/entities'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'

export type ICommunityComponent = {
  getCommunity: (id: string, userAddress: EthAddress) => Promise<CommunityWithMembersCount>
  getCommunities: (
    userAddress: EthAddress,
    options: GetCommunitiesOptions
  ) => Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>>
  getCommunitiesPublicInformation: (
    options: GetCommunitiesOptions
  ) => Promise<GetCommunitiesWithTotal<CommunityPublicInformation>>
  deleteCommunity: (id: string, userAddress: EthAddress) => Promise<void>
  createCommunity: (community: Omit<Community, 'id' | 'active' | 'privacy'>) => Promise<Community>
  getCommunityMembers: (
    id: string,
    userAddress: EthAddress,
    pagination: Required<PaginatedParameters>
  ) => Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
  getMemberCommunities: (
    memberAddress: EthAddress,
    options: Pick<GetCommunitiesOptions, 'pagination'>
  ) => Promise<GetCommunitiesWithTotal<MemberCommunity>>
  kickMember: (communityId: string, kickerAddress: EthAddress, targetAddress: EthAddress) => Promise<void>
  joinCommunity: (communityId: string, memberAddress: EthAddress) => Promise<void>
  leaveCommunity: (communityId: string, memberAddress: EthAddress) => Promise<void>
  banMember: (communityId: string, bannerAddress: EthAddress, targetAddress: EthAddress) => Promise<void>
  unbanMember: (communityId: string, unbannerAddress: EthAddress, targetAddress: EthAddress) => Promise<void>
  getBannedMembers: (
    id: string,
    userAddress: EthAddress,
    pagination: Required<PaginatedParameters>
  ) => Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
}

export type ICommunityRolesComponent = {
  hasPermission: (role: CommunityRole, permission: CommunityPermission) => boolean
  getRolePermissions: (role: CommunityRole) => CommunityPermission[]
  canKickMemberFromCommunity: (
    communityId: string,
    kickerAddress: string,
    memberToKickAddress: string
  ) => Promise<boolean>
  canBanMemberFromCommunity: (
    communityId: string,
    bannerAddress: string,
    memberToBanAddress: string
  ) => Promise<boolean>
  canUnbanMemberFromCommunity: (
    communityId: string,
    unbannerAddress: string,
    memberToUnbanAddress: string
  ) => Promise<boolean>
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
  role: CommunityRole
  membersCount: number
}

export type CommunityWithMembersCountAndFriends = CommunityWithMembersCount & {
  friends: string[]
}

export type GetCommunitiesOptions = {
  pagination: Pagination
  search?: string | null
  onlyPublic?: boolean
  sortBy?: 'membersCount' | 'role'
  onlyMemberOf?: boolean
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

export type MemberCommunity = Pick<Community, 'id' | 'name' | 'thumbnails' | 'ownerAddress'> & { role: CommunityRole }

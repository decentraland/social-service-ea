import {
  FriendProfile,
  FriendshipStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, CommunityPermission, Action } from '../../types/entities'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'

export interface ICommunityComponent {
  getCommunity(id: string, userAddress: EthAddress): Promise<CommunityWithMembersCount>
  getCommunities(
    userAddress: string,
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>>
  getCommunitiesPublicInformation(
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<CommunityPublicInformation>>
  getCommunityMembers(
    id: string,
    userAddress: EthAddress,
    options: GetCommunityMembersOptions
  ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
  getMembersFromPublicCommunity(
    id: string,
    options: GetCommunityMembersOptions
  ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
  getMemberCommunities(
    memberAddress: string,
    options: Pick<GetCommunitiesOptions, 'pagination'>
  ): Promise<GetCommunitiesWithTotal<MemberCommunity>>
  kickMember(communityId: string, kickerAddress: EthAddress, targetAddress: EthAddress): Promise<void>
  joinCommunity(communityId: string, memberAddress: EthAddress): Promise<void>
  leaveCommunity(communityId: string, memberAddress: EthAddress): Promise<void>
  createCommunity(
    community: Omit<Community, 'id' | 'active' | 'privacy' | 'thumbnails'>,
    thumbnail?: Buffer,
    placeIds?: string[]
  ): Promise<Community>
  deleteCommunity(id: string, userAddress: string): Promise<void>
  banMember(communityId: string, bannerAddress: EthAddress, targetAddress: EthAddress): Promise<void>
  unbanMember(communityId: string, unbannerAddress: EthAddress, targetAddress: EthAddress): Promise<void>
  getBannedMembers(
    id: string,
    userAddress: EthAddress,
    pagination: Required<PaginatedParameters>
  ): Promise<{ members: BannedMemberProfile[]; totalMembers: number }>
  updateMemberRole(
    communityId: string,
    updaterAddress: EthAddress,
    targetAddress: EthAddress,
    newRole: CommunityRole
  ): Promise<void>
  getCommunityPlaces(
    communityId: string,
    options: {
      userAddress?: EthAddress
      pagination: PaginatedParameters
    }
  ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }>
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
  canUpdateMemberRole: (
    communityId: string,
    updaterAddress: string,
    targetAddress: string,
    newRole: CommunityRole
  ) => Promise<boolean>
  canAddPlacesToCommunity: (communityId: string, adderAddress: string) => Promise<boolean>
  canRemovePlacesFromCommunity: (communityId: string, removerAddress: string) => Promise<boolean>
}

export type ICommunityPlacesComponent = {
  getPlaces(
    communityId: string,
    pagination: PaginatedParameters
  ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }>
  addPlaces(communityId: string, userAddress: EthAddress, placeIds: string[]): Promise<void>
  removePlace(communityId: string, userAddress: EthAddress, placeId: string): Promise<void>
  validateOwnership(
    placeIds: string[],
    userAddress: EthAddress
  ): Promise<{ ownedPlaces: string[]; notOwnedPlaces: string[]; isValid: boolean }>
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

type FriendshipAction = {
  lastFriendshipAction?: Action
  actingUser?: string
}

export type CommunityMember = {
  communityId: string
  memberAddress: string
  role: CommunityRole
  joinedAt: string
} & FriendshipAction

export type BannedMember = {
  communityId: string
  memberAddress: string
  bannedAt: string
  bannedBy: string
} & FriendshipAction

export type CommunityMemberProfile = CommunityMember & {
  profilePictureUrl: string
  hasClaimedName: boolean
  name: string
  friendshipStatus: FriendshipStatus
}

export type BannedMemberProfile = BannedMember & {
  profilePictureUrl: string
  hasClaimedName: boolean
  name: string
  friendshipStatus: FriendshipStatus
}

export type CommunityWithMembersCount = Community & {
  role: CommunityRole
  membersCount: number
}

export type CommunityWithMembersCountAndFriends = CommunityWithMembersCount & {
  friends: string[]
}

export type GetCommunitiesOptions = {
  pagination: PaginatedParameters
  search?: string | null
  onlyPublic?: boolean
  sortBy?: 'membersCount' | 'role'
  onlyMemberOf?: boolean
}

export type GetCommunityMembersOptions = {
  pagination: Required<PaginatedParameters>
  onlyOnline?: boolean
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

export type CommunityPlace = {
  id: string
  communityId: string
  addedBy: string
  addedAt: Date
}

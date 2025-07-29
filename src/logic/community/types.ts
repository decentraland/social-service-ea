import {
  FriendProfile,
  FriendshipStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, Action } from '../../types/entities'
import { CommunityMemberBannedEvent, CommunityMemberRemovedEvent, EthAddress, PaginatedParameters } from '@dcl/schemas'
import { CommunityDeletedEventReducedMetadata, CommunityRenamedEventReducedMetadata } from './broadcaster'

export interface ICommunitiesComponent {
  getCommunity(id: string, userAddress: EthAddress): Promise<AggregatedCommunityWithMemberAndVoiceChatData>
  getCommunities(
    userAddress: string,
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<Omit<CommunityWithUserInformation, 'isHostingLiveEvent'>>>
  getCommunitiesPublicInformation(
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<Omit<CommunityPublicInformation, 'isHostingLiveEvent'>>>
  getMemberCommunities(
    memberAddress: string,
    options: Pick<GetCommunitiesOptions, 'pagination'>
  ): Promise<GetCommunitiesWithTotal<MemberCommunity>>
  createCommunity(
    community: Omit<Community, 'id' | 'active' | 'privacy' | 'thumbnails'>,
    thumbnail?: Buffer,
    placeIds?: string[]
  ): Promise<AggregatedCommunity>
  updateCommunity(communityId: string, userAddress: EthAddress, updates: CommunityUpdates): Promise<Community>
  deleteCommunity(id: string, userAddress: string): Promise<void>
}

export interface ICommunityMembersComponent {
  getCommunityMembers(
    id: string,
    userAddress: EthAddress,
    options: GetCommunityMembersOptions
  ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
  getMembersFromPublicCommunity(
    id: string,
    options: GetCommunityMembersOptions
  ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }>
  getOnlineMembersFromCommunity(
    id: string,
    onlineUsers: EthAddress[],
    batchSize?: number
  ): AsyncGenerator<Array<{ memberAddress: string }>>
  getOnlineMembersFromUserCommunities(
    userAddress: EthAddress,
    onlineUsers: EthAddress[],
    batchSize?: number
  ): AsyncGenerator<Array<{ communityId: string; memberAddress: string }>>
  kickMember(communityId: string, kickerAddress: EthAddress, targetAddress: EthAddress): Promise<void>
  joinCommunity(communityId: string, memberAddress: EthAddress): Promise<void>
  leaveCommunity(communityId: string, memberAddress: EthAddress): Promise<void>
  updateMemberRole(
    communityId: string,
    updaterAddress: EthAddress,
    targetAddress: EthAddress,
    newRole: CommunityRole
  ): Promise<void>
}

export interface ICommunityRolesComponent {
  validatePermissionToKickMemberFromCommunity: (
    communityId: string,
    kickerAddress: string,
    memberToKickAddress: string
  ) => Promise<void>
  validatePermissionToGetBannedMembers: (communityId: string, userAddress: string) => Promise<void>
  validatePermissionToBanMemberFromCommunity: (
    communityId: string,
    bannerAddress: string,
    memberToBanAddress: string
  ) => Promise<void>
  validatePermissionToUnbanMemberFromCommunity: (
    communityId: string,
    unbannerAddress: string,
    memberToUnbanAddress: string
  ) => Promise<void>
  validatePermissionToUpdateMemberRole: (
    communityId: string,
    updaterAddress: string,
    targetAddress: string,
    newRole: CommunityRole
  ) => Promise<void>
  validatePermissionToAddPlacesToCommunity: (communityId: string, adderAddress: string) => Promise<void>
  validatePermissionToRemovePlacesFromCommunity: (communityId: string, removerAddress: string) => Promise<void>
  validatePermissionToUpdatePlaces: (communityId: string, editorAddress: string) => Promise<void>
  validatePermissionToEditCommunity: (communityId: string, editorAddress: string) => Promise<void>
  validatePermissionToDeleteCommunity: (communityId: string, removerAddress: string) => Promise<void>
  validatePermissionToLeaveCommunity: (communityId: string, memberAddress: string) => Promise<void>
}

export interface ICommunityEventsComponent {
  isCurrentlyHostingEvents: (communityId: string) => Promise<boolean>
}

export interface ICommunityPlacesComponent {
  getPlaces(
    communityId: string,
    options: {
      userAddress?: EthAddress
      pagination: PaginatedParameters
    }
  ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }>
  validateAndAddPlaces(communityId: string, placesOwner: EthAddress, placeIds: string[]): Promise<void>
  addPlaces(communityId: string, placesOwner: EthAddress, placeIds: string[]): Promise<void>
  removePlace(communityId: string, userAddress: EthAddress, placeId: string): Promise<void>
  updatePlaces(communityId: string, userAddress: EthAddress, placeIds: string[]): Promise<void>
  validateOwnership(
    placeIds: string[],
    userAddress: EthAddress
  ): Promise<{
    ownedPlaces: string[]
    notOwnedPlaces: string[]
    isValid: boolean
  }>
}

export interface ICommunityBansComponent {
  getBannedMembers: (
    id: string,
    userAddress: EthAddress,
    pagination: Required<PaginatedParameters>
  ) => Promise<{ members: BannedMemberProfile[]; totalMembers: number }>
  banMember: (communityId: string, bannerAddress: EthAddress, targetAddress: EthAddress) => Promise<void>
  unbanMember: (communityId: string, unbannerAddress: EthAddress, targetAddress: EthAddress) => Promise<void>
}

export interface ICommunityOwnersComponent {
  /**
   * Fetches the profile from Catalyst and extracts the name.
   * The name is cached in Redis for 10 minutes.
   * Throws an error if the profile is not found or the name is not available.
   *
   * @param ownerAddress - The address of the owner of the community.
   * @param communityId - The id of the community.
   * @returns The name of the owner of the community.
   *
   * @memberof ICommunityOwnersComponent
   */
  getOwnerName: (ownerAddress: EthAddress, communityId?: string) => Promise<string>
}

export interface ICommunityBroadcasterComponent {
  broadcast(
    event:
      | CommunityDeletedEventReducedMetadata
      | CommunityRenamedEventReducedMetadata
      | CommunityMemberRemovedEvent
      | CommunityMemberBannedEvent
  ): Promise<void>
}

export interface ICommunityThumbnailComponent {
  buildThumbnailUrl(communityId: string): string
  getThumbnail(communityId: string): Promise<string | undefined>
  uploadThumbnail(communityId: string, thumbnail: Buffer): Promise<string>
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

export type CommunityUpdates = {
  name?: string
  description?: string
  placeIds?: string[]
  thumbnailBuffer?: Buffer
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

/*
  AggregatedCommunity is a community with additional information that is not stored in the database.
  This additional information is fetched from external sources.
*/
export type AggregatedCommunity = Community & {
  ownerName: string
  isHostingLiveEvent: boolean
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

export type AggregatedCommunityWithMemberData = AggregatedCommunity & {
  role: CommunityRole
  membersCount: number
}

export type CommunityVoiceChatStatus = {
  isActive: boolean
  participantCount: number
  moderatorCount: number
}

export type AggregatedCommunityWithMemberAndVoiceChatData = AggregatedCommunityWithMemberData & {
  voiceChatStatus: CommunityVoiceChatStatus | null
}

export type AggregatedCommunityWithMemberAndFriendsData = AggregatedCommunityWithMemberData & {
  friends: string[]
}

export type GetCommunitiesOptions = {
  pagination: PaginatedParameters
  search?: string | null
  onlyPublic?: boolean
  sortBy?: 'membersCount' | 'role'
  onlyMemberOf?: boolean
  onlyWithActiveVoiceChat?: boolean
}

export type GetCommunityMembersOptions = {
  pagination: Required<PaginatedParameters>
  onlyOnline?: boolean
}

export type CommunityWithUserInformation = AggregatedCommunityWithMemberData & {
  friends: FriendProfile[]
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

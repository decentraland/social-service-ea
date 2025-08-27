import {
  FriendProfile,
  FriendshipStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { CommunityRole, Action } from '../../types/entities'
import { CommunityMemberBannedEvent, CommunityMemberRemovedEvent, EthAddress, PaginatedParameters } from '@dcl/schemas'
import { CommunityDeletedEventReducedMetadata, CommunityRenamedEventReducedMetadata } from './broadcaster'

export interface ICommunitiesComponent {
  getCommunity(id: string, options: { as?: EthAddress }): Promise<AggregatedCommunityWithMemberAndVoiceChatData>
  getCommunities(
    userAddress: string,
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<Omit<CommunityWithUserInformationAndVoiceChat, 'isHostingLiveEvent'>>>
  getCommunitiesPublicInformation(
    options: GetCommunitiesOptions
  ): Promise<GetCommunitiesWithTotal<Omit<CommunityPublicInformationWithVoiceChat, 'isHostingLiveEvent'>>>
  getMemberCommunities(
    memberAddress: string,
    options: Pick<GetCommunitiesOptions, 'pagination' | 'roles'>
  ): Promise<GetCommunitiesWithTotal<MemberCommunity>>
  createCommunity(
    community: Omit<Community, 'id' | 'active' | 'thumbnails'>,
    thumbnail?: Buffer,
    placeIds?: string[]
  ): Promise<AggregatedCommunity>
  updateCommunity(communityId: string, userAddress: EthAddress, updates: CommunityUpdates): Promise<Community>
  deleteCommunity(id: string, userAddress: string): Promise<void>
  getCommunityInvites(inviter: EthAddress, invitee: EthAddress): Promise<Community[]>
}

export interface ICommunityMembersComponent {
  getCommunityMembers(
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
  /**
   * Aggregates any member data with their profile information.
   */
  aggregateWithProfiles<T extends { memberAddress: EthAddress }>(
    userAddress: EthAddress | undefined,
    members: T[]
  ): Promise<(T & CommunityMemberProfile)[]>
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
  validatePermissionToUpdateCommunityPrivacy: (communityId: string, updaterAddress: string) => Promise<void>
  validatePermissionToDeleteCommunity: (communityId: string, removerAddress: string) => Promise<void>
  validatePermissionToLeaveCommunity: (communityId: string, memberAddress: string) => Promise<void>
  validatePermissionToAcceptAndRejectRequests: (communityId: string, memberAddress: string) => Promise<void>
  validatePermissionToViewRequests: (communityId: string, memberAddress: string) => Promise<void>
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
  getPlacesWithPositionsAndWorlds(communityId: string): Promise<{ positions: string[]; worlds: string[] }>
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

export type ListCommunityRequestsOptions = {
  type?: CommunityRequestType
  pagination: Required<PaginatedParameters>
}

export type RequestActionOptions = {
  callerAddress: EthAddress
}

export interface ICommunityRequestsComponent {
  /**
   * Creates a community request for a given community and member address.
   *
   * @param communityId - The id of the community.
   * @param memberAddress - The address of the member to create the request for.
   * @param type - The type of request to create.
   * @returns The created community request.
   */
  createCommunityRequest(
    communityId: string,
    memberAddress: EthAddress,
    type: CommunityRequestType
  ): Promise<MemberRequest>
  /**
   * Returns pending requests (invites received and requests sent) for a user, optionally filtered by type.
   */
  getMemberRequests(
    memberAddress: EthAddress,
    options: ListCommunityRequestsOptions
  ): Promise<{ requests: MemberRequest[]; total: number }>
  getCommunityRequests(
    communityId: string,
    options: ListCommunityRequestsOptions & RequestActionOptions
  ): Promise<{ requests: MemberRequest[]; total: number }>
  updateRequestStatus(
    requestId: string,
    status: Exclude<CommunityRequestStatus, 'pending'>,
    options: RequestActionOptions
  ): Promise<void>
  /**
   * Aggregates member requests with their associated community data.
   */
  aggregateRequestsWithCommunities(
    memberAddress: EthAddress,
    requests: MemberRequest[]
  ): Promise<MemberCommunityRequest[]>
}

export type CommunityDB = {
  id?: string
  name: string
  description: string
  owner_address: string
  private: boolean
  active: boolean
  needs_manual_review?: boolean
  created_at?: string
  updated_at?: string
}

export type CommunityUpdates = {
  name?: string
  description?: string
  placeIds?: string[]
  thumbnailBuffer?: Buffer
  privacy?: CommunityPrivacyEnum
}

export enum CommunityPrivacyEnum {
  Public = 'public',
  Private = 'private'
}

export type Community = {
  id: string
  thumbnails?: Record<string, string>
  name: string
  description: string
  ownerAddress: string
  privacy: CommunityPrivacyEnum
  active: boolean
  needsManualReview: boolean
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
  roles?: CommunityRole[]
  communityIds?: string[]
}

export type GetCommunityMembersOptions = {
  pagination: Required<PaginatedParameters>
  onlyOnline?: boolean
  /**
   * The address of the user to get the members for.
   * If provided, friendships statuses will be included in the response.
   */
  as?: EthAddress
  byPassPrivacy?: boolean
}

export type GetCommunityRequestsOptions = {
  pagination: Required<PaginatedParameters>
  targetAddress?: EthAddress
  status?: CommunityRequestStatus
  type?: CommunityRequestType
}

export type CommunityWithUserInformation = WithCommonFriends<AggregatedCommunityWithMemberData>

export type WithCommonFriends<T> = T & {
  friends: FriendProfile[]
}

export type CommunityWithUserInformationAndVoiceChat = CommunityWithUserInformation & {
  voiceChatStatus: CommunityVoiceChatStatus | null
}

export type CommunityPublicInformation = Omit<CommunityWithUserInformation, 'role' | 'friends' | 'privacy'> & {
  privacy: CommunityPrivacyEnum.Public
}

export type CommunityPublicInformationWithVoiceChat = CommunityPublicInformation & {
  voiceChatStatus: CommunityVoiceChatStatus | null
}

export type GetCommunitiesWithTotal<T> = {
  communities: T[]
  total: number
}

export type MemberCommunity = Pick<Community, 'id' | 'name' | 'thumbnails' | 'ownerAddress' | 'active'> & {
  role: CommunityRole
}

export type CommunityPlace = {
  id: string
  communityId: string
  addedBy: string
  addedAt: Date
}

export enum CommunityRequestStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Cancelled = 'cancelled'
}

export enum CommunityRequestType {
  Invite = 'invite',
  RequestToJoin = 'request_to_join'
}

export type MemberRequest = {
  id: string
  communityId: string
  memberAddress: string
  type: CommunityRequestType
  status: CommunityRequestStatus
}

export type MemberCommunityRequest = WithCommonFriends<{
  id: string
  communityId: string
  thumbnails?: Record<string, string>
  name: string
  description: string
  ownerAddress: string
  ownerName: string
  privacy: CommunityPrivacyEnum
  membersCount: number
  type: CommunityRequestType
}>

export interface ActiveCommunityVoiceChat {
  communityId: string
  participantCount: number
  moderatorCount: number
  isMember: boolean
  communityName: string
  communityImage?: string
  positions: string[]
  worlds: string[]
}

import type { IBaseComponent, ICacheComponent as IBaseCacheComponent } from '@well-known-components/interfaces'
import { IPgComponent as IBasePgComponent } from '@well-known-components/pg-component'
import { WebSocketServer } from 'ws'
import { Emitter } from 'mitt'
import { Transport } from '@dcl/rpc'
import { PoolClient } from 'pg'
import { createClient, SetOptions } from 'redis'
import { Subscription } from '@well-known-components/nats-component/dist/types'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'
import { SQLStatement } from 'sql-template-strings'
import {
  Action,
  BlockedUserWithDate,
  CommunityRole,
  Friendship,
  FriendshipAction,
  FriendshipRequest,
  OwnedName,
  PrivateMessagesPrivacy,
  PrivateVoiceChat,
  SocialSettings,
  User
} from './entities'
import {
  Community,
  CommunityDB,
  CommunityMember,
  CommunityVoiceChatStatus,
  AggregatedCommunityWithMemberAndFriendsData,
  GetCommunitiesOptions,
  CommunityPublicInformation,
  MemberCommunity,
  BannedMember,
  CommunityPlace,
  CommunityRequestType,
  MemberRequest,
  GetCommunityRequestsOptions,
  CommunityForModeration,
  CommunityPost,
  CommunityPostWithLikes,
  GetCommunityPostsOptions
} from '../logic/community'
import { Pagination } from './entities'
import { Subscribers, SubscriptionEventsEmitter } from './rpc'
import { RpcServiceCreators } from '../controllers/routes/rpc.routes'
import { SubscriptionHandlerParams, UpdatesMessageHandler } from '../logic/updates'
import { PlacesApiResponse } from '../adapters/places-api'
import { RewardAttributes } from '../logic/referral/types'
import { CommunityVoiceChatProfileData } from '../logic/community-voice/types'

export interface IRpcClient extends IBaseComponent {
  client: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  authAddress: string
  connect: () => Promise<void>
}

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
  detachUser(address: string): void
  setServiceCreators(creators: RpcServiceCreators): void
}
export interface IFriendsDatabaseComponent {
  createFriendship(
    users: [string, string],
    isActive: boolean,
    txClient?: PoolClient
  ): Promise<{
    id: string
    created_at: Date
  }>
  updateFriendshipStatus(
    friendshipId: string,
    isActive: boolean,
    txClient?: PoolClient
  ): Promise<{
    id: string
    created_at: Date
  }>
  getFriends(
    userAddress: string,
    options?: {
      pagination?: Pagination
      onlyActive?: boolean
    }
  ): Promise<User[]>
  getFriendsFromList(userAddress: string, otherUserAddresses: string[]): Promise<User[]>
  getFriendsCount(
    userAddress: string,
    options?: {
      onlyActive?: boolean
    }
  ): Promise<number>
  getMutualFriends(userAddress1: string, userAddress2: string, pagination?: Pagination): Promise<User[]>
  getMutualFriendsCount(userAddress1: string, userAddress2: string): Promise<number>
  getFriendship(userAddresses: [string, string], txClient?: PoolClient): Promise<Friendship | undefined>
  getLastFriendshipActionByUsers(loggedUser: string, friendUser: string): Promise<FriendshipAction | undefined>
  recordFriendshipAction(
    friendshipId: string,
    actingUser: string,
    action: Action,
    metadata: Record<string, any> | null,
    txClient?: PoolClient
  ): Promise<string>
  getReceivedFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  getReceivedFriendshipRequestsCount(userAddress: string): Promise<number>
  getSentFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  getSentFriendshipRequestsCount(userAddress: string): Promise<number>
  getOnlineFriends(userAddress: string, potentialFriends: string[]): Promise<User[]>
  getSocialSettings(userAddresses: string[]): Promise<SocialSettings[]>
  upsertSocialSettings(userAddress: string, settings: Partial<Omit<SocialSettings, 'address'>>): Promise<SocialSettings>
  deleteSocialSettings(userAddress: string): Promise<void>
  getOnlineFriends(userAddress: string, potentialFriends: string[]): Promise<User[]>
  blockUser(
    blockerAddress: string,
    blockedAddress: string,
    txClient?: PoolClient
  ): Promise<{ id: string; blocked_at: Date }>
  unblockUser(blockerAddress: string, blockedAddress: string, txClient?: PoolClient): Promise<void>
  blockUsers(blockerAddress: string, blockedAddresses: string[]): Promise<void>
  unblockUsers(blockerAddress: string, blockedAddresses: string[]): Promise<void>
  getBlockedUsers(blockerAddress: string): Promise<BlockedUserWithDate[]>
  getBlockedByUsers(blockedAddress: string): Promise<BlockedUserWithDate[]>
  isFriendshipBlocked(blockerAddress: string, blockedAddress: string): Promise<boolean>
  executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T>
}

export interface ICommunitiesDatabaseComponent {
  communityExists(communityId: string, options?: Pick<GetCommunitiesOptions, 'onlyPublic'>): Promise<boolean>
  getCommunity(id: string, userAddress?: EthAddress): Promise<(Community & { role: CommunityRole }) | null>
  getCommunityPlaces(communityId: string, pagination?: PaginatedParameters): Promise<Pick<CommunityPlace, 'id'>[]>
  getCommunityPlacesCount(communityId: string): Promise<number>
  communityPlaceExists(communityId: string, placeId: string): Promise<boolean>
  addCommunityPlace(place: CommunityPlace): Promise<void>
  addCommunityPlaces(places: Omit<CommunityPlace, 'addedAt'>[]): Promise<void>
  removeCommunityPlace(communityId: string, placeId: string): Promise<void>
  removeCommunityPlacesWithExceptions(communityId: string, exceptPlaceIds: string[]): Promise<void>
  createCommunity(community: Omit<CommunityDB, 'ranking_score' | 'editors_choice'>): Promise<Community>
  deleteCommunity(id: string): Promise<void>
  getCommunities(
    memberAddress: EthAddress,
    options: GetCommunitiesOptions
  ): Promise<Omit<AggregatedCommunityWithMemberAndFriendsData, 'ownerName'>[]>
  getCommunitiesCount(
    memberAddress: EthAddress,
    options: Pick<GetCommunitiesOptions, 'search' | 'onlyMemberOf' | 'roles' | 'communityIds'>
  ): Promise<number>
  getCommunitiesPublicInformation(
    options: GetCommunitiesOptions
  ): Promise<Omit<CommunityPublicInformation, 'ownerName'>[]>
  getPublicCommunitiesCount(options: Pick<GetCommunitiesOptions, 'search' | 'communityIds'>): Promise<number>
  getAllCommunitiesForModeration(options: GetCommunitiesOptions): Promise<CommunityForModeration[]>
  getAllCommunitiesForModerationCount(options: Pick<GetCommunitiesOptions, 'search'>): Promise<number>
  isMemberOfCommunity(communityId: string, userAddress: EthAddress): Promise<boolean>
  getCommunityMemberRole(id: string, userAddress: EthAddress): Promise<CommunityRole>
  getCommunityMemberRoles(id: string, userAddresses: EthAddress[]): Promise<Record<string, CommunityRole>>
  updateMemberRole(communityId: string, memberAddress: EthAddress, newRole: CommunityRole): Promise<void>
  transferCommunityOwnership(communityId: string, newOwnerAddress: EthAddress): Promise<void>
  addCommunityMember(member: Omit<CommunityMember, 'joinedAt'>): Promise<void>
  kickMemberFromCommunity(communityId: string, memberAddress: EthAddress): Promise<void>
  getCommunityMembers(
    id: string,
    options: { userAddress?: EthAddress; pagination: Pagination; filterByMembers?: string[]; roles?: CommunityRole[] }
  ): Promise<CommunityMember[]>
  getCommunityMembersCount(communityId: string, options?: { filterByMembers?: string[] }): Promise<number>
  getMemberCommunities(
    memberAddress: EthAddress,
    options: Pick<GetCommunitiesOptions, 'pagination' | 'roles'>
  ): Promise<MemberCommunity[]>
  getOnlineMembersFromUserCommunities(
    userAddress: EthAddress,
    onlineUsers: string[],
    pagination: Pagination
  ): Promise<{ communityId: string; memberAddress: string }[]>
  banMemberFromCommunity(communityId: string, bannedBy: EthAddress, bannedMemberAddress: EthAddress): Promise<void>
  unbanMemberFromCommunity(
    communityId: string,
    unbannedBy: EthAddress,
    unbannedMemberAddress: EthAddress
  ): Promise<void>
  isMemberBanned(communityId: string, bannedMemberAddress: EthAddress): Promise<boolean>
  getBannedMembers(communityId: string, userAddress: EthAddress, pagination: Pagination): Promise<BannedMember[]>
  getBannedMembersCount(communityId: string): Promise<number>
  updateCommunity(
    communityId: string,
    updates: Partial<
      Pick<CommunityDB, 'name' | 'description' | 'private' | 'unlisted' | 'ranking_score' | 'editors_choice'>
    >
  ): Promise<Community>
  createCommunityRequest(
    communityId: string,
    memberAddress: EthAddress,
    type: CommunityRequestType
  ): Promise<MemberRequest>
  getCommunityRequests(communityId: string, filters: GetCommunityRequestsOptions): Promise<MemberRequest[]>
  getCommunityRequestsCount(
    communityId: string,
    filters: Pick<GetCommunityRequestsOptions, 'status' | 'type'>
  ): Promise<number>
  getMemberRequests(
    memberAddress: string,
    filters: Pick<GetCommunityRequestsOptions, 'status' | 'type' | 'pagination'>
  ): Promise<MemberRequest[]>
  getMemberRequestsCount(
    memberAddress: string,
    filters: Pick<GetCommunityRequestsOptions, 'status' | 'type'>
  ): Promise<number>
  getCommunityRequest(requestId: string): Promise<MemberRequest | undefined>
  removeCommunityRequest(requestId: string): Promise<void>
  joinMemberAndRemoveRequests(member: Omit<CommunityMember, 'joinedAt'>): Promise<string | undefined>
  getCommunityInvites(inviter: EthAddress, invitee: EthAddress): Promise<Community[]>
  acceptAllRequestsToJoin(communityId: string): Promise<string[]>
  createPost(post: { communityId: string; authorAddress: string; content: string }): Promise<CommunityPost>
  getPost(postId: string): Promise<CommunityPost | null>
  getPosts(communityId: string, options: GetCommunityPostsOptions): Promise<CommunityPostWithLikes[]>
  getPostsCount(communityId: string): Promise<number>
  deletePost(postId: string): Promise<void>
  likePost(postId: string, userAddress: EthAddress): Promise<void>
  unlikePost(postId: string, userAddress: EthAddress): Promise<void>
  unlikePostsFromCommunity(communityId: string, userAddress: EthAddress): Promise<void>
  updateCommunityRankingScore(communityId: string, score: number): Promise<void>
  setEditorChoice(communityId: string, isEditorChoice: boolean): Promise<void>
  getNewMembersCount(communityId: string, days: number): Promise<number>
  getPlacesCount(communityId: string): Promise<number>
  getAllCommunitiesWithRankingMetrics(): Promise<
    Array<{
      id: string
      eventCount: number
      photosCount: number
      hasDescription: number
      placesCount: number
      newMembersCount: number
      announcementsCount: number
      streamsCount: number
      eventsTotalAttendees: number
      streamingTotalParticipants: number
    }>
  >
  incrementCommunityEventsCount(communityId: string, totalAttendees?: number): Promise<void>
  incrementCommunityPhotosCount(communityId: string): Promise<void>
  incrementCommunityStreamingCount(communityId: string, totalParticipants?: number): Promise<void>
}

export interface IVoiceDatabaseComponent {
  areUsersBeingCalledOrCallingSomeone(userAddresses: string[]): Promise<boolean>
  createPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string>
  getPrivateVoiceChat(callId: string): Promise<PrivateVoiceChat | null>
  deletePrivateVoiceChat(callId: string): Promise<PrivateVoiceChat | null>
  getPrivateVoiceChatForCalleeAddress(calleeAddress: string): Promise<PrivateVoiceChat | null>
  getPrivateVoiceChatOfUser(address: string): Promise<PrivateVoiceChat | null>
  expirePrivateVoiceChat(limit: number): Promise<PrivateVoiceChat[]>
}

export interface IRedisComponent extends IBaseComponent {
  client: ReturnType<typeof createClient>
}

export interface ICacheComponent extends IBaseCacheComponent {
  get: <T>(key: string) => Promise<T | null>
  mGet: <T>(keys: string[]) => Promise<T[]>
  put: <T>(key: string, value: T, options?: SetOptions & { noTTL?: boolean }) => Promise<void>
}

export type IPubSubComponent = IBaseComponent & {
  subscribeToChannel(channel: string, cb: (message: string) => void): Promise<void>
  publishInChannel<T>(channel: string, update: T): Promise<void>
}

export interface IStatsComponent {
  getPeers(): Promise<string[]>
}

export type IArchipelagoStatsComponent = IStatsComponent & {
  fetchPeers(): Promise<string[]>
}

export type IWorldsStatsComponent = IStatsComponent & {
  onPeerConnect(address: string): Promise<void>
  onPeerDisconnect(address: string): Promise<void>
}

export type IPeersSynchronizer = IBaseComponent & {
  syncPeers(): Promise<void>
}

export type IPeerTrackingComponent = IBaseComponent & {
  getSubscriptions(): Map<string, Subscription>
  subscribeToPeerStatusUpdates(): Promise<void>
}

export type ICatalystClientRequestOptions = {
  retries?: number
  waitTime?: number
  lambdasServerUrl?: string
}

export type ICatalystClientComponent = {
  getProfiles(ids: string[], options?: ICatalystClientRequestOptions): Promise<Profile[]>
  getProfile(id: string, options?: ICatalystClientRequestOptions): Promise<Profile>
  getOwnedNames(
    address: EthAddress,
    params?: GetNamesParams,
    options?: ICatalystClientRequestOptions
  ): Promise<OwnedName[]>
}

export interface ICdnCacheInvalidatorComponent {
  invalidateThumbnail(communityId: string): Promise<void>
}

export type ISubscribersContext = {
  getSubscribers: () => Subscribers
  getSubscribersAddresses: () => string[]
  getOrAddSubscriber: (address: string) => Emitter<SubscriptionEventsEmitter>
  addSubscriber: (address: string, subscriber: Emitter<SubscriptionEventsEmitter>) => void
  removeSubscriber: (address: string) => void
}

export type ITracingComponent = IBaseComponent & {
  captureException(error: Error, context?: Record<string, any>): void
}

export type ICommsGatekeeperComponent = {
  getPrivateVoiceChatCredentials: (
    roomId: string,
    calleeAddress: string,
    callerAddress: string
  ) => Promise<Record<string, { connectionUrl: string }>>
  isUserInAVoiceChat: (address: string) => Promise<boolean>
  updateUserPrivateMessagePrivacyMetadata: (
    user: string,
    privateMessagesPrivacy: PrivateMessagesPrivacy
  ) => Promise<void>
  endPrivateVoiceChat: (callId: string, address: string) => Promise<string[]>
  getCommunityVoiceChatCredentials: (
    communityId: string,
    userAddress: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatProfileData | null
  ) => Promise<{ connectionUrl: string }>
  createCommunityVoiceChatRoom: (
    communityId: string,
    moderatorAddress: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatProfileData | null
  ) => Promise<{ connectionUrl: string }>
  endCommunityVoiceChatRoom: (communityId: string, userAddress: string) => Promise<void>
  updateUserMetadataInCommunityVoiceChat: (communityId: string, userAddress: string, metadata: any) => Promise<void>
  requestToSpeakInCommunityVoiceChat: (
    communityId: string,
    userAddress: string,
    isRaisingHand?: boolean
  ) => Promise<void>
  rejectSpeakRequestInCommunityVoiceChat: (communityId: string, userAddress: string) => Promise<void>
  promoteSpeakerInCommunityVoiceChat: (communityId: string, userAddress: string) => Promise<void>
  demoteSpeakerInCommunityVoiceChat: (communityId: string, userAddress: string) => Promise<void>
  getCommunityVoiceChatStatus: (communityId: string) => Promise<CommunityVoiceChatStatus | null>
  getCommunitiesVoiceChatStatus: (communityIds: string[]) => Promise<Record<string, CommunityVoiceChatStatus>>
  getAllActiveCommunityVoiceChats: () => Promise<
    Array<{
      communityId: string
      participantCount: number
      moderatorCount: number
    }>
  >
  kickUserFromCommunityVoiceChat: (communityId: string, userAddress: string) => Promise<void>
  isUserInCommunityVoiceChat: (userAddress: string) => Promise<boolean>
  muteSpeakerInCommunityVoiceChat: (communityId: string, userAddress: string, muted: boolean) => Promise<void>
}

export type IWebSocketComponent = IBaseComponent & {
  ws: WebSocketServer
}

export type IStatusCheckComponent = IBaseComponent

export interface IPgComponent extends IBasePgComponent {
  getCount(query: SQLStatement): Promise<number>
  exists<T extends Record<string, any>>(query: SQLStatement, existsProp: keyof T): Promise<boolean>
  withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    onError?: (error: unknown) => Promise<void>
  ): Promise<T>
}

export interface ICommunitiesDbHelperComponent {
  forceCommunityRemoval: (communityId: string) => Promise<void>
  forceCommunityMemberRemoval: (communityId: string, memberAddresses: string[]) => Promise<void>
  forceCommunityRequestRemoval: (requestId: string) => Promise<void>
  updateCommunityRequestStatus: (requestId: string, status: string) => Promise<void>
}

export interface IStorageComponent {
  storeFile: (file: Buffer, key: string) => Promise<string>
  exists: (key: string) => Promise<boolean>
  existsMultiple: (keys: string[]) => Promise<Record<string, boolean>>
}

export interface IStorageHelperComponent {
  removeFile: (key: string) => Promise<void>
}

export interface IPlacesApiComponent {
  getPlaces: (placesIds: string[]) => Promise<PlacesApiResponse['data']>
}

export interface IUpdateHandlerComponent {
  friendshipUpdateHandler: UpdatesMessageHandler
  friendshipAcceptedUpdateHandler: UpdatesMessageHandler
  friendConnectivityUpdateHandler: UpdatesMessageHandler
  communityMemberConnectivityUpdateHandler: UpdatesMessageHandler
  blockUpdateHandler: UpdatesMessageHandler
  privateVoiceChatUpdateHandler: UpdatesMessageHandler
  communityMemberStatusHandler: UpdatesMessageHandler
  communityVoiceChatUpdateHandler: UpdatesMessageHandler
  communityDeletedUpdateHandler: UpdatesMessageHandler
  handleSubscriptionUpdates: <T, U>(params: SubscriptionHandlerParams<T, U>) => AsyncGenerator<T>
}

export type IRewardComponent = IBaseComponent & {
  sendReward(campaignKey: string, beneficiary: string): Promise<RewardAttributes[]>
}

export type IEmailComponent = IBaseComponent & {
  sendEmail(email: string, subject: string, content: string): Promise<void>
}

import type { IBaseComponent, ICacheComponent as IBaseCacheComponent } from '@well-known-components/interfaces'
import { IPgComponent as IBasePgComponent } from '@well-known-components/pg-component'
import { WebSocketServer } from 'ws'
import { Emitter } from 'mitt'
import { Transport } from '@dcl/rpc'
import { PoolClient } from 'pg'
import { createClient, SetOptions } from 'redis'
import { Subscription } from '@well-known-components/nats-component/dist/types'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { FriendshipAcceptedEvent, FriendshipRequestEvent } from '@dcl/schemas'
import { PublishCommandOutput } from '@aws-sdk/client-sns'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'
import {
  Action,
  BlockUserWithDate,
  CommunityRole,
  Friendship,
  FriendshipAction,
  FriendshipRequest,
  PrivateMessagesPrivacy,
  SocialSettings,
  User
} from './entities'
import {
  Community,
  CommunityDB,
  CommunityMember,
  CommunityWithMembersCountAndFriends,
  GetCommunitiesOptions,
  CommunityPublicInformation,
  MemberCommunity
} from '../logic/community'
import { Pagination } from './entities'
import { Subscribers, SubscriptionEventsEmitter } from './rpc'
import { SQLStatement } from 'sql-template-strings'

export interface IRpcClient extends IBaseComponent {
  client: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  authAddress: string
  connect: () => Promise<void>
}

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
  detachUser(address: string): void
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
  getBlockedUsers(blockerAddress: string): Promise<BlockUserWithDate[]>
  getBlockedByUsers(blockedAddress: string): Promise<BlockUserWithDate[]>
  isFriendshipBlocked(blockerAddress: string, blockedAddress: string): Promise<boolean>
  executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T>
}

export interface ICommunitiesDatabaseComponent {
  communityExists(communityId: string): Promise<boolean>
  isMemberOfCommunity(communityId: string, userAddress: string): Promise<boolean>
  getCommunity(id: string, userAddress: string): Promise<Community | null>
  getCommunityMembers(id: string, pagination: Pagination): Promise<CommunityMember[]>
  getCommunityMemberRole(id: string, userAddress: string): Promise<CommunityRole>
  getCommunityMemberRoles(id: string, userAddresses: string[]): Promise<Record<string, CommunityRole>>
  getCommunityPlaces(communityId: string): Promise<string[]>
  getCommunityMembersCount(communityId: string): Promise<number>
  getCommunities(memberAddress: string, options: GetCommunitiesOptions): Promise<CommunityWithMembersCountAndFriends[]>
  getCommunitiesCount(
    memberAddress: string,
    options: Pick<GetCommunitiesOptions, 'search' | 'onlyMemberOf'>
  ): Promise<number>
  getCommunitiesPublicInformation(options: GetCommunitiesOptions): Promise<CommunityPublicInformation[]>
  getPublicCommunitiesCount(options: Pick<GetCommunitiesOptions, 'search'>): Promise<number>
  getMemberCommunities(
    memberAddress: string,
    options: Pick<GetCommunitiesOptions, 'pagination'>
  ): Promise<MemberCommunity[]>
  createCommunity(community: CommunityDB): Promise<{ id: string }>
  deleteCommunity(id: string): Promise<void>
  addCommunityMember(member: Omit<CommunityMember, 'joinedAt'>): Promise<void>
  kickMemberFromCommunity(communityId: string, memberAddress: string): Promise<void>
}

export interface IRedisComponent extends IBaseComponent {
  client: ReturnType<typeof createClient>
}

export interface ICacheComponent extends IBaseCacheComponent {
  get: <T>(key: string) => Promise<T | null>
  put: <T>(key: string, value: T, options?: SetOptions) => Promise<void>
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
}

export type IPublisherComponent = {
  publishMessage(event: FriendshipRequestEvent | FriendshipAcceptedEvent): Promise<PublishCommandOutput>
}

export type IWSPoolComponent = {
  acquireConnection(id: string): Promise<void>
  releaseConnection(id: string): void
  updateActivity(id: string): void
  isConnectionAvailable(id: string): Promise<boolean>
  getActiveConnections(): Promise<number>
  cleanup(): void
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
  updateUserPrivateMessagePrivacyMetadata: (
    user: string,
    privateMessagesPrivacy: PrivateMessagesPrivacy
  ) => Promise<void>
}

export type IWebSocketComponent = IBaseComponent & {
  ws: WebSocketServer
}

export type IStatusCheckComponent = IBaseComponent

export interface IPgComponent extends IBasePgComponent {
  getCount(query: SQLStatement): Promise<number>
  withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    onError?: (error: unknown) => Promise<void>
  ): Promise<T>
}

export interface ICommunitiesDbHelperComponent {
  forceCommunityRemoval: (communityId: string) => Promise<void>
  forceCommunityMemberRemoval: (communityId: string, memberAddresses: string[]) => Promise<void>
}

import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent,
  IFetchComponent,
  ICacheComponent as IBaseCacheComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import { WebSocketServer } from 'ws'
import { Emitter } from 'mitt'
import { metricDeclarations } from './metrics'
import { HttpRequest, HttpResponse, IUWsComponent, WebSocket } from '@well-known-components/uws-http-server'
import { IUWebSocketEventMap } from './utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'
import { PoolClient } from 'pg'
import { createClient, SetOptions } from 'redis'
import { INatsComponent, Subscription } from '@well-known-components/nats-component/dist/types'
import {
  ConnectivityStatus,
  SocialServiceDefinition
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { FriendshipAcceptedEvent, FriendshipRequestEvent } from '@dcl/schemas'
import { PublishCommandOutput } from '@aws-sdk/client-sns'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IUWsComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  pg: IPgComponent
  db: IDatabaseComponent
  rpcServer: IRPCServerComponent
  fetcher: IFetchComponent
  redis: IRedisComponent & ICacheComponent
  pubsub: IPubSubComponent
  archipelagoStats: IArchipelagoStatsComponent
  worldsStats: IWorldsStatsComponent
  peersSynchronizer: IPeersSynchronizer
  nats: INatsComponent
  peerTracking: IPeerTrackingComponent
  catalystClient: ICatalystClientComponent
  sns: IPublisherComponent
  wsPool: IWSPoolComponent
  subscribersContext: ISubscribersContext
  tracing: ITracingComponent
  commsGatekeeper: ICommsGatekeeperComponent
}

// components used in runtime
export type AppComponents = BaseComponents

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  rpcClient: IRpcClient
}

export interface IRpcClient extends IBaseComponent {
  client: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  authAddress: string
  connect: () => Promise<void>
}

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
  detachUser(address: string): void
}
export interface IDatabaseComponent {
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

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type IWebSocketComponent = IBaseComponent & {
  ws: WebSocketServer
}

export type JsonBody = Record<string, any>
export type ResponseBody = JsonBody | string

export type IHandlerResult = {
  status?: number
  headers?: Record<string, string>
  body?: ResponseBody
}

export type IHandler = {
  path: string
  f: (res: HttpResponse, req: HttpRequest) => Promise<IHandlerResult>
}

type WsBaseUserData = {
  isConnected: boolean
  auth: boolean
  authenticating: boolean
  wsConnectionId: string
  connectionStartTime: number
}

export type WsAuthenticatedUserData = WsBaseUserData & {
  eventEmitter: Emitter<IUWebSocketEventMap>
  address: string
  transport: Transport
}

export type WsNotAuthenticatedUserData = WsBaseUserData & {
  timeout?: NodeJS.Timeout
}

export type WsUserData = WsAuthenticatedUserData | WsNotAuthenticatedUserData

export type InternalWebSocket = WebSocket<WsUserData>

export type RPCServiceContext<ComponentNames extends keyof AppComponents> = {
  components: Pick<AppComponents, ComponentNames>
}

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export type SubscriptionEventsEmitter = {
  friendshipUpdate: {
    id: string
    to: string
    from: string
    action: Action
    timestamp: number
    metadata?: { message: string }
  }
  friendConnectivityUpdate: {
    address: string
    status: ConnectivityStatus
  }
  blockUpdate: {
    blockerAddress: string
    blockedAddress: string
    isBlocked: boolean
  }
}

export type Subscribers = Record<string, Emitter<SubscriptionEventsEmitter>>

export type RpcServerContext = {
  address: string
  subscribersContext: ISubscribersContext
}

export type Friendship = {
  id: string
  address_requester: string
  address_requested: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SocialSettings = {
  address: string
  private_messages_privacy: PrivateMessagesPrivacy
  blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting
}

export enum PrivateMessagesPrivacy {
  ONLY_FRIENDS = 'only_friends',
  ALL = 'all'
}

export enum BlockedUsersMessagesVisibilitySetting {
  SHOW_MESSAGES = 'show_messages',
  DO_NOT_SHOW_MESSAGES = 'do_not_show_messages'
}

export type User = {
  address: string
}

export type BlockUserWithDate = User & {
  blocked_at: Date
}

export enum Action {
  REQUEST = 'request', // request a friendship
  CANCEL = 'cancel', // cancel a friendship request
  ACCEPT = 'accept', // accept a friendship request
  REJECT = 'reject', // reject a friendship request
  DELETE = 'delete', // delete a friendship
  BLOCK = 'block' // block a user
}

export type FriendshipAction = {
  id: string
  friendship_id: string
  action: Action
  acting_user: string
  metadata?: Record<string, any>
  timestamp: string
}

export enum FriendshipStatus {
  Requested,
  Friends,
  NotFriends
}

export type FriendshipRequest = {
  id: string
  address: string
  timestamp: string
  metadata: Record<string, any> | null
}

export type Pagination = {
  limit: number
  offset: number
}

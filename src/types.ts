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
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { FriendshipAcceptedEvent, FriendshipRequestEvent } from '@dcl/schemas'
import { PublishCommandOutput } from '@aws-sdk/client-sns'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

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
  peersSynchronizer: IPeersSynchronizer
  nats: INatsComponent
  peerTracking: IPeerTrackingComponent
  catalystClient: ICatalystClientComponent
  sns: IPublisherComponent
  wsPool: IWSPoolComponent
  subscribersContext: ISubscribersContext
}

// components used in runtime
export type AppComponents = BaseComponents

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
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
  blockUser(
    blockerAddress: string,
    blockedAddress: string,
    txClient?: PoolClient
  ): Promise<{ id: string; blocked_at: Date }>
  unblockUser(blockerAddress: string, blockedAddress: string, txClient?: PoolClient): Promise<void>
  blockUsers(blockerAddress: string, blockedAddresses: string[]): Promise<void>
  unblockUsers(blockerAddress: string, blockedAddresses: string[]): Promise<void>
  getBlockedUsers(blockerAddress: string): Promise<string[]>
  getBlockedByUsers(blockedAddress: string): Promise<string[]>
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

export type IArchipelagoStatsComponent = IBaseComponent & {
  getPeers(): Promise<string[]>
  getPeersFromCache(): Promise<string[]>
}

export type IPeersSynchronizer = IBaseComponent
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

export type WsAuthenticatedUserData = {
  isConnected: boolean
  eventEmitter: Emitter<IUWebSocketEventMap>
  auth: true
  address: string
  wsConnectionId: string
  transport: Transport
}

export type WsNotAuthenticatedUserData = {
  isConnected: boolean
  auth: false
  timeout?: NodeJS.Timeout
  wsConnectionId: string
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
    address: string
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

export type User = {
  address: string
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

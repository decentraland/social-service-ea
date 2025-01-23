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
import { Entity } from '@dcl/schemas'

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
  catalystClient: ICatalystClient
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
  updateFriendshipStatus(friendshipId: string, isActive: boolean, txClient?: PoolClient): Promise<boolean>
  getFriends(
    userAddress: string,
    options?: {
      pagination?: Pagination
      onlyActive?: boolean
    }
  ): Promise<Friend[]>
  getFriendsCount(
    userAddress: string,
    options?: {
      onlyActive?: boolean
    }
  ): Promise<number>
  getMutualFriends(userAddress1: string, userAddress2: string, pagination?: Pagination): Promise<Friend[]>
  getMutualFriendsCount(userAddress1: string, userAddress2: string): Promise<number>
  getFriendship(userAddresses: [string, string]): Promise<Friendship | undefined>
  getLastFriendshipAction(friendshipId: string): Promise<FriendshipAction | undefined>
  getLastFriendshipActionByUsers(loggedUser: string, friendUser: string): Promise<FriendshipAction | undefined>
  recordFriendshipAction(
    friendshipId: string,
    actingUser: string,
    action: Action,
    metadata: Record<string, any> | null,
    txClient?: PoolClient
  ): Promise<string>
  getReceivedFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  getSentFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  streamOnlineFriends(userAddress: string, onlinePeers: string[]): AsyncGenerator<Friend>
  getOnlineFriends(userAddress: string, potentialFriends: string[]): Promise<Friend[]>
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
  contentServerUrl?: string
}

export type ICatalystClient = {
  getEntitiesByPointers(pointers: string[], options?: ICatalystClientRequestOptions): Promise<Entity[]>
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
}

export type WsNotAuthenticatedUserData = {
  isConnected: boolean
  auth: false
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
  friendStatusUpdate: {
    address: string
    status: ConnectivityStatus
  }
}

export type Subscribers = Record<string, Emitter<SubscriptionEventsEmitter>>

export type RpcServerContext = {
  address: string
  subscribers: Subscribers
}

export type Friendship = {
  id: string
  address_requester: string
  address_requested: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Friend = {
  address: string
}

export enum Action {
  REQUEST = 'request', // request a friendship
  CANCEL = 'cancel', // cancel a friendship request
  ACCEPT = 'accept', // accept a friendship request
  REJECT = 'reject', // reject a friendship request
  DELETE = 'delete' // delete a friendship
}

// [to]: [from]
export const FRIENDSHIP_ACTION_TRANSITIONS: Record<Action, (Action | null)[]> = {
  [Action.REQUEST]: [Action.CANCEL, Action.REJECT, Action.DELETE, null],
  [Action.ACCEPT]: [Action.REQUEST],
  [Action.CANCEL]: [Action.REQUEST],
  [Action.REJECT]: [Action.REQUEST],
  [Action.DELETE]: [Action.ACCEPT]
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

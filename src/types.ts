import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent,
  IFetchComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import { WebSocketServer } from 'ws'
import { Emitter } from 'mitt'
import { metricDeclarations } from './metrics'
import { IDatabaseComponent } from './adapters/db'
import { IRedisComponent } from './ports/redis'
import { IRPCServerComponent } from './adapters/rpcServer'
import { IPubSubComponent } from './adapters/pubsub'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  pg: IPgComponent
  db: IDatabaseComponent
  ws: IWebSocketComponent
  rpcServer: IRPCServerComponent
  fetcher: IFetchComponent
  redis: IRedisComponent
  pubsub: IPubSubComponent
}

// components used in runtime
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
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

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export type IWebSocketComponent = IBaseComponent & {
  ws: WebSocketServer
}

export type RpcServerContext = {
  address: string
  subscribers: Record<string, Emitter<SubscriptionEventsEmitter>>
}

export type Friendship = {
  id: string
  address_requester: string
  address_requested: string
  is_active: boolean
  created_at: string
  updated_at: string
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
  address: string
  timestamp: string
  metadata: Record<string, any> | null
}

export type SubscriptionEventsEmitter = {
  update: {
    to: string
    from: string
    action: Action
    timestamp: number
    metadata?: { message: string }
  }
}

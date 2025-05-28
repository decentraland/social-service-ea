import type {
  IConfigComponent,
  ILoggerComponent,
  IMetricsComponent,
  IFetchComponent,
  IHttpServerComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import { metricDeclarations } from '../metrics'
import { IUWsComponent } from '@well-known-components/uws-http-server'
import { INatsComponent } from '@well-known-components/nats-component/dist/types'
import {
  IFriendsDatabaseComponent,
  IRPCServerComponent,
  IRedisComponent,
  IPubSubComponent,
  IArchipelagoStatsComponent,
  IWorldsStatsComponent,
  IPeersSynchronizer,
  IPeerTrackingComponent,
  ICatalystClientComponent,
  IPublisherComponent,
  IWSPoolComponent,
  ISubscribersContext,
  ITracingComponent,
  ICommsGatekeeperComponent,
  IRpcClient,
  ICacheComponent,
  IStatusCheckComponent,
  ICommunitiesDatabaseComponent
} from './components'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  uwsServer: IUWsComponent
  httpServer: IHttpServerComponent<GlobalContext>
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  pg: IPgComponent
  friendsDb: IFriendsDatabaseComponent
  communitiesDb: ICommunitiesDatabaseComponent
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
  statusChecks: IStatusCheckComponent
}

// components used in runtime
export type AppComponents = BaseComponents

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  rpcClient: IRpcClient
}

import type {
  IConfigComponent,
  ILoggerComponent,
  IMetricsComponent,
  IFetchComponent,
  IHttpServerComponent
} from '@well-known-components/interfaces'
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
  ICommunitiesDatabaseComponent,
  IPgComponent,
  ICommunitiesDbHelperComponent,
  IVoiceDatabaseComponent
} from './components'
import { ICommunityComponent } from '../logic/community'
import { ISettingsComponent } from '../logic/settings'
import { IVoiceComponent } from '../logic/voice'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  archipelagoStats: IArchipelagoStatsComponent
  catalystClient: ICatalystClientComponent
  commsGatekeeper: ICommsGatekeeperComponent
  community: ICommunityComponent
  communitiesDb: ICommunitiesDatabaseComponent
  config: IConfigComponent
  fetcher: IFetchComponent
  friendsDb: IFriendsDatabaseComponent
  httpServer: IHttpServerComponent<GlobalContext>
  logs: ILoggerComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  nats: INatsComponent
  peerTracking: IPeerTrackingComponent
  peersSynchronizer: IPeersSynchronizer
  pg: IPgComponent
  pubsub: IPubSubComponent
  redis: IRedisComponent & ICacheComponent
  rpcServer: IRPCServerComponent
  sns: IPublisherComponent
  statusChecks: IStatusCheckComponent
  subscribersContext: ISubscribersContext
  tracing: ITracingComponent
  uwsServer: IUWsComponent
  worldsStats: IWorldsStatsComponent
  wsPool: IWSPoolComponent
  settings: ISettingsComponent
  voice: IVoiceComponent
  voiceDb: IVoiceDatabaseComponent
}

// components used in runtime
export type AppComponents = BaseComponents

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localUwsFetch: IFetchComponent
  localHttpFetch: IFetchComponent
  rpcClient: IRpcClient
  communitiesDbHelper: ICommunitiesDbHelperComponent
}

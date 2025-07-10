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
import { IAnalyticsComponent } from '@dcl/analytics-component'
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
  ISubscribersContext,
  ITracingComponent,
  ICommsGatekeeperComponent,
  IRpcClient,
  ICacheComponent,
  IStatusCheckComponent,
  ICommunitiesDatabaseComponent,
  IPgComponent,
  ICommunitiesDbHelperComponent,
  IVoiceDatabaseComponent,
  IStorageComponent,
  IStorageHelperComponent,
  IPlacesApiComponent,
  IUpdateHandlerComponent,
  IRewardComponent
} from './components'
import {
  ICommunitiesComponent,
  ICommunityBansComponent,
  ICommunityMembersComponent,
  ICommunityOwnersComponent,
  ICommunityPlacesComponent,
  ICommunityRolesComponent
} from '../logic/community'
import { ISettingsComponent } from '../logic/settings'
import { IVoiceComponent } from '../logic/voice'
import { IReferralComponent } from '../logic/referral'
import { IReferralDatabaseComponent } from './referral-db.type'
import { IQueueComponent } from './sqs.type'
import { IMessageProcessorComponent, IMessageConsumerComponent } from '../logic/sqs'
import { IPeersStatsComponent } from '../logic/peers-stats'
import { IJobComponent } from '../logic/job'
import { IWsPoolComponent } from '../logic/ws-pool'
import { AnalyticsEventPayload } from './analytics'

export type GlobalContext = {
  components: BaseComponents
}

export type MetricsDeclaration = keyof typeof metricDeclarations

// components used in every environment
export type BaseComponents = {
  analytics: IAnalyticsComponent<AnalyticsEventPayload>
  archipelagoStats: IArchipelagoStatsComponent
  catalystClient: ICatalystClientComponent
  commsGatekeeper: ICommsGatekeeperComponent
  communities: ICommunitiesComponent
  communitiesDb: ICommunitiesDatabaseComponent
  communityBans: ICommunityBansComponent
  communityOwners: ICommunityOwnersComponent
  communityMembers: ICommunityMembersComponent
  communityPlaces: ICommunityPlacesComponent
  communityRoles: ICommunityRolesComponent
  config: IConfigComponent
  expirePrivateVoiceChatJob?: IJobComponent
  fetcher: IFetchComponent
  friendsDb: IFriendsDatabaseComponent
  httpServer: IHttpServerComponent<GlobalContext>
  logs: ILoggerComponent
  messageConsumer: IMessageConsumerComponent
  messageProcessor: IMessageProcessorComponent
  metrics: IMetricsComponent<MetricsDeclaration>
  nats: INatsComponent
  peerTracking: IPeerTrackingComponent
  peersStats: IPeersStatsComponent
  peersSynchronizer: IPeersSynchronizer
  pg: IPgComponent
  placesApi: IPlacesApiComponent
  pubsub: IPubSubComponent
  queue: IQueueComponent
  redis: IRedisComponent & ICacheComponent
  referral: IReferralComponent
  referralDb: IReferralDatabaseComponent
  rewards: IRewardComponent
  rpcServer: IRPCServerComponent
  settings: ISettingsComponent
  sns: IPublisherComponent
  statusChecks: IStatusCheckComponent
  storage: IStorageComponent
  subscribersContext: ISubscribersContext
  tracing: ITracingComponent
  updateHandler: IUpdateHandlerComponent
  uwsServer: IUWsComponent
  voice: IVoiceComponent
  voiceDb: IVoiceDatabaseComponent
  worldsStats: IWorldsStatsComponent
  wsPool: IWsPoolComponent
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
  storageHelper: IStorageHelperComponent
}

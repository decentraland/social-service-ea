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
import { IFeaturesComponent } from '@well-known-components/features-component'
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
  IRewardComponent,
  IEmailComponent,
  ICdnCacheInvalidatorComponent,
  IRegistryComponent
} from './components'
import { ICommunityVoiceChatCacheComponent } from '../logic/community-voice/community-voice-cache'
import { ICommunityVoiceChatPollingComponent } from '../logic/community-voice/community-voice-polling'
import {
  ICommunitiesComponent,
  ICommunityBansComponent,
  ICommunityBroadcasterComponent,
  ICommunityMembersComponent,
  ICommunityOwnersComponent,
  ICommunityPlacesComponent,
  ICommunityPostsComponent,
  ICommunityRolesComponent,
  ICommunityEventsComponent,
  ICommunityThumbnailComponent,
  ICommunityRequestsComponent,
  ICommunityComplianceValidatorComponent,
  ICommunityFieldsValidatorComponent,
  ICommunityRankingComponent
} from '../logic/community'
import { ISettingsComponent } from '../logic/settings'
import { IVoiceComponent } from '../logic/voice'
import { ICommunityVoiceComponent } from '../logic/community-voice'
import { IReferralComponent } from '../logic/referral'
import { IReferralDatabaseComponent } from './referral-db.type'
import { IQueueComponent } from '@dcl/sqs-component'
import { IMessageProcessorComponent, IMessageConsumerComponent } from '../logic/sqs'
import { IPeersStatsComponent } from '../logic/peers-stats'
import { IJobComponent } from '@dcl/job-component'
import { IWsPoolComponent } from '../logic/ws-pool'
import { AnalyticsEventPayload } from './analytics'
import { IFriendsComponent } from '../logic/friends'
import { ISlackComponent } from '@dcl/slack-component'
import { IAIComplianceComponent } from '../adapters/ai-compliance'
import { IFeatureFlagsAdapter } from '../adapters/feature-flags'
import { IPublisherComponent } from '@dcl/sns-component'
import { ISchemaValidatorComponent } from '@dcl/schema-validator-component'

export type GlobalContext = {
  components: BaseComponents
}

export type MetricsDeclaration = keyof typeof metricDeclarations

// components used in every environment
export type BaseComponents = {
  aiCompliance: IAIComplianceComponent
  analytics: IAnalyticsComponent<AnalyticsEventPayload>
  archipelagoStats: IArchipelagoStatsComponent
  registry: IRegistryComponent
  catalystClient: ICatalystClientComponent
  commsGatekeeper: ICommsGatekeeperComponent
  communities: ICommunitiesComponent
  communitiesDb: ICommunitiesDatabaseComponent
  communityBans: ICommunityBansComponent
  communityComplianceValidator: ICommunityComplianceValidatorComponent
  communityFieldsValidator: ICommunityFieldsValidatorComponent
  communityOwners: ICommunityOwnersComponent
  communityMembers: ICommunityMembersComponent
  communityPlaces: ICommunityPlacesComponent
  communityPosts: ICommunityPostsComponent
  communityRoles: ICommunityRolesComponent
  communityRanking: ICommunityRankingComponent
  communityVoice: ICommunityVoiceComponent
  communityEvents: ICommunityEventsComponent
  communityBroadcaster: ICommunityBroadcasterComponent
  communityThumbnail: ICommunityThumbnailComponent
  communityRequests: ICommunityRequestsComponent
  config: IConfigComponent
  email: IEmailComponent
  expirePrivateVoiceChatJob?: IJobComponent
  features: IFeaturesComponent
  featureFlags: IFeatureFlagsAdapter
  fetcher: IFetchComponent
  friendsDb: IFriendsDatabaseComponent
  httpServer: IHttpServerComponent<GlobalContext>
  logs: ILoggerComponent
  memoryCache: ICacheComponent
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
  cdnCacheInvalidator: ICdnCacheInvalidatorComponent
  friends: IFriendsComponent
  communityVoiceChatCache: ICommunityVoiceChatCacheComponent
  communityVoiceChatPolling: ICommunityVoiceChatPollingComponent
  communityVoiceChatPollingJob?: IJobComponent
  communityRankingCalculationJob?: IJobComponent
  slack: ISlackComponent
  schemaValidator: ISchemaValidatorComponent<GlobalContext>
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

import { resolve } from 'path'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@well-known-components/http-server'
import { createConfigComponent, createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createAnalyticsComponent } from '@dcl/analytics-component'
import { createPgComponent } from './adapters/pg'
import { AppComponents, GlobalContext } from './types'
import { metricDeclarations } from './metrics'
import { createFriendsDBComponent } from './adapters/friends-db'
import { createSubscribersContext, createRpcServerComponent } from './adapters/rpc-server'
import { createRedisComponent } from './adapters/redis'
import { createPubSubComponent } from './adapters/pubsub'
import { createUWsComponent } from '@well-known-components/uws-http-server'
import { createArchipelagoStatsComponent } from './adapters/archipelago-stats'
import { createPeersSynchronizerComponent } from './adapters/peers-synchronizer'
import { createNatsComponent } from '@well-known-components/nats-component'
import { createPeerTrackingComponent } from './adapters/peer-tracking'
import { createCatalystClient } from './adapters/catalyst-client'
import { createWorldsStatsComponent } from './adapters/worlds-stats'
import { createTracingComponent } from './adapters/tracing'
import { createCommsGatekeeperComponent } from './adapters/comms-gatekeeper'
import { createVoiceComponent } from './logic/voice'
import { createCommunityVoiceComponent } from './logic/community-voice'
import { createSettingsComponent } from './logic/settings'
import { createCommunitiesDBComponent } from './adapters/communities-db'
import { createVoiceDBComponent } from './adapters/voice-db'
import {
  createCommunityBansComponent,
  createCommunityComponent,
  createCommunityMembersComponent,
  createCommunityRolesComponent,
  createCommunityOwnersComponent,
  createCommunityPlacesComponent,
  createCommunityEventsComponent,
  createCommunityBroadcasterComponent,
  createCommunityThumbnailComponent,
  createCommunityComplianceValidatorComponent,
  createCommunityFieldsValidatorComponent,
  createCommunityRequestsComponent,
  createCommunityPostsComponent
} from './logic/community'
import { createRankingComponent } from './logic/community/ranking'
import { createReferralDBComponent } from './adapters/referral-db'
import { createReferralComponent } from './logic/referral'
import { createMessageProcessorComponent, createMessagesConsumerComponent } from './logic/sqs'
import { createMemoryQueueAdapter } from './adapters/memory-queue'
import { createPeersStatsComponent } from './logic/peers-stats'
import { createS3Adapter } from './adapters/s3'
import { createJobComponent } from './logic/job'
import { createPlacesApiAdapter } from './adapters/places-api'
import { createUpdateHandlerComponent } from './logic/updates'
import { AnalyticsEventPayload } from './types/analytics'
import { createRewardComponent } from './adapters/rewards'
import { createWsPoolComponent } from './logic/ws-pool'
import { createCdnCacheInvalidatorComponent } from './adapters/cdn-cache-invalidator'
import { createEmailComponent } from './adapters/email'
import { createFriendsComponent } from './logic/friends'
import { createCommunityVoiceChatCacheComponent } from './logic/community-voice/community-voice-cache'
import { createCommunityVoiceChatPollingComponent } from './logic/community-voice/community-voice-polling'
import { createSlackComponent } from '@dcl/slack-component'
import { createAIComplianceComponent } from './adapters/ai-compliance'
import { createFeaturesComponent } from '@well-known-components/features-component'
import { createFeatureFlagsAdapter } from './adapters/feature-flags'
import { createInMemoryCacheComponent } from './adapters/memory-cache'
import { createSqsComponent } from '@dcl/sqs-component'
import { createSnsComponent } from '@dcl/sns-component'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  const uwsHttpServerConfig = createConfigComponent({
    HTTP_SERVER_PORT: await config.requireString('UWS_SERVER_PORT'), // 5000
    HTTP_SERVER_HOST: await config.requireString('HTTP_SERVER_HOST')
  })

  const apiSeverConfig = createConfigComponent({
    HTTP_SERVER_PORT: await config.requireString('API_HTTP_SERVER_PORT'), // 5001
    HTTP_SERVER_HOST: await config.requireString('HTTP_SERVER_HOST')
  })

  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics, config })
  const tracing = await createTracingComponent({ config, logs })

  const httpServer = await createServerComponent<GlobalContext>(
    { config: apiSeverConfig, logs },
    {
      cors: {
        methods: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT', 'PATCH'],
        maxAge: 86400
      }
    }
  )
  const uwsServer = await createUWsComponent({ config: uwsHttpServerConfig, logs })
  const statusChecks = await createStatusCheckComponent({ server: httpServer, config })

  const fetcher = createFetchComponent()
  const memoryCache = createInMemoryCacheComponent()

  await instrumentHttpServerWithPromClientRegistry({ server: httpServer, metrics, config, registry: metrics.registry! })

  let databaseUrl: string | undefined = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (!databaseUrl) {
    const dbUser = await config.requireString('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = await config.requireString('PG_COMPONENT_PSQL_PORT')
    const dbHost = await config.requireString('PG_COMPONENT_PSQL_HOST')
    const dbPassword = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }
  const privateVoiceChatJobInterval = await config.requireNumber('PRIVATE_VOICE_CHAT_JOB_INTERVAL')
  const communityVoiceChatPollingJobInterval = await config.requireNumber('COMMUNITY_VOICE_CHAT_POLLING_JOB_INTERVAL')

  const pg = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl,
        dir: resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up'
      }
    }
  )

  const friendsDb = createFriendsDBComponent({ pg, logs })
  const communitiesDb = createCommunitiesDBComponent({ pg, logs })
  const referralDb = await createReferralDBComponent({ pg, logs, config })
  const analytics = await createAnalyticsComponent<AnalyticsEventPayload>({ logs, fetcher, config })
  const sns = await createSnsComponent({ config })

  const serviceBaseUrl = (await config.getString('SERVICE_BASE_URL')) || 'https://social-service-ea.decentraland.zone'
  const features = await createFeaturesComponent({ config, logs, fetch: fetcher }, serviceBaseUrl)
  const featureFlags = await createFeatureFlagsAdapter({ config, logs, features })

  const email = await createEmailComponent({ fetcher, config })
  const rewards = await createRewardComponent({ fetcher, config })

  const placesApi = await createPlacesApiAdapter({ fetcher, config })
  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, fetcher, redis })
  const worldsStats = await createWorldsStatsComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const commsGatekeeper = await createCommsGatekeeperComponent({ logs, config, fetcher })
  const catalystClient = await createCatalystClient({ config, fetcher, redis, logs })
  const cdnCacheInvalidator = await createCdnCacheInvalidatorComponent({ config, fetcher })
  const settings = await createSettingsComponent({ friendsDb })
  const voiceDb = await createVoiceDBComponent({ pg, config })
  const voice = await createVoiceComponent({
    logs,
    config,
    voiceDb,
    friendsDb,
    commsGatekeeper,
    settings,
    pubsub,
    analytics
  })
  // Community voice chat cache and polling
  const communityVoiceChatCache = createCommunityVoiceChatCacheComponent({ logs, redis })
  const communityVoiceChatPolling = createCommunityVoiceChatPollingComponent({
    logs,
    commsGatekeeper,
    pubsub,
    communityVoiceChatCache
  })

  const storage = await createS3Adapter({ config })
  const subscribersContext = createSubscribersContext()
  const peersStats = createPeersStatsComponent({ archipelagoStats, worldsStats })
  const communityThumbnail = await createCommunityThumbnailComponent({ config, storage })

  const communityBroadcaster = createCommunityBroadcasterComponent({ sns, communitiesDb })
  const communityRoles = createCommunityRolesComponent({ communitiesDb, logs })

  const communityPlaces = await createCommunityPlacesComponent({
    communitiesDb,
    communityRoles,
    logs,
    placesApi
  })

  const communityVoice = await createCommunityVoiceComponent({
    logs,
    commsGatekeeper,
    communitiesDb,
    pubsub,
    analytics,
    catalystClient,
    communityVoiceChatCache,
    placesApi,
    communityThumbnail,
    communityPlaces
  })
  const communityMembers = await createCommunityMembersComponent({
    communitiesDb,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    catalystClient,
    peersStats,
    pubsub,
    commsGatekeeper,
    analytics
  })
  const communityBans = await createCommunityBansComponent({
    communitiesDb,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    catalystClient,
    pubsub,
    commsGatekeeper,
    analytics
  })
  const communityOwners = createCommunityOwnersComponent({ catalystClient })
  const communityEvents = await createCommunityEventsComponent({ config, logs, fetcher, redis })

  // AI Compliance components
  const aiCompliance = await createAIComplianceComponent({ config, logs, featureFlags, metrics, redis })
  const communityComplianceValidator = createCommunityComplianceValidatorComponent({ aiCompliance, featureFlags, logs })

  const communities = createCommunityComponent({
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    communityOwners,
    communityEvents,
    cdnCacheInvalidator,
    communityThumbnail,
    communityBroadcaster,
    commsGatekeeper,
    communityComplianceValidator,
    featureFlags,
    pubsub,
    logs,
    analytics
  })
  const communityFieldsValidator = await createCommunityFieldsValidatorComponent({ config })
  const communityRequests = createCommunityRequestsComponent({
    communitiesDb,
    communities,
    communityRoles,
    communityBroadcaster,
    communityThumbnail,
    catalystClient,
    pubsub,
    logs,
    analytics
  })

  const communityPosts = createCommunityPostsComponent({
    communitiesDb,
    communityRoles,
    catalystClient,
    logs
  })

  const rankingComponent = createRankingComponent({ logs, communitiesDb, communityThumbnail })

  const dailyCommunityRankingCalculationJob = createJobComponent(
    { logs },
    rankingComponent.calculateRankingScoreForAllCommunities,
    24 * 60 * 60 * 1000, // 24 hours in milliseconds
    { repeat: true, startupDelay: 60 * 60 * 1000 } // Start after 1 hour delay
  )

  const friends = await createFriendsComponent({ friendsDb, catalystClient, pubsub, sns, logs })
  const updateHandler = createUpdateHandlerComponent({
    logs,
    subscribersContext,
    friendsDb,
    communityMembers,
    catalystClient
  })

  const rpcServer = await createRpcServerComponent({
    logs,
    pubsub,
    uwsServer,
    config,
    subscribersContext,
    metrics,
    voice,
    updateHandler
  })

  const peersSynchronizer = await createPeersSynchronizerComponent({ logs, archipelagoStats, redis, config })
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config, worldsStats })
  const wsPool = createWsPoolComponent({ logs, metrics })

  const expirePrivateVoiceChatJob = createJobComponent(
    { logs },
    voice.expirePrivateVoiceChat,
    privateVoiceChatJobInterval,
    { repeat: true }
  )

  // Community voice chat polling job (every 45 seconds)
  const communityVoiceChatPollingJob = createJobComponent(
    { logs },
    communityVoiceChatPolling.checkAllVoiceChats,
    communityVoiceChatPollingJobInterval,
    { repeat: true }
  )
  const sqsEndpoint = await config.getString('AWS_SQS_ENDPOINT')
  const queue = sqsEndpoint ? await createSqsComponent(config) : createMemoryQueueAdapter()

  const slackToken = await config.requireString('SLACK_BOT_TOKEN')
  const slack = await createSlackComponent({ logs }, { token: slackToken })

  const referral = await createReferralComponent({ referralDb, logs, sns, config, rewards, email, slack, redis })

  const messageProcessor = await createMessageProcessorComponent({ logs, referral })

  const messageConsumer = createMessagesConsumerComponent({
    logs,
    queue,
    messageProcessor
  })

  return {
    aiCompliance,
    analytics,
    archipelagoStats,
    catalystClient,
    cdnCacheInvalidator,
    commsGatekeeper,
    communities,
    communitiesDb,
    communityBans,
    communityBroadcaster,
    communityComplianceValidator,
    communityFieldsValidator,
    communityEvents,
    communityMembers,
    communityOwners,
    communityPlaces,
    communityPosts,
    communityRoles,
    communityRequests,
    communityThumbnail,
    communityVoice,
    communityVoiceChatCache,
    communityVoiceChatPolling,
    communityVoiceChatPollingJob,
    dailyCommunityRankingCalculationJob,
    config,
    email,
    expirePrivateVoiceChatJob,
    features,
    featureFlags,
    fetcher,
    friends,
    friendsDb,
    httpServer,
    logs,
    memoryCache,
    messageConsumer,
    messageProcessor,
    metrics,
    nats,
    peerTracking,
    peersStats,
    peersSynchronizer,
    pg,
    placesApi,
    pubsub,
    queue,
    rankingComponent,
    redis,
    referral,
    referralDb,
    rewards,
    rpcServer,
    settings,
    slack,
    sns,
    statusChecks,
    storage,
    subscribersContext,
    tracing,
    updateHandler,
    uwsServer,
    voice,
    voiceDb,
    worldsStats,
    wsPool
  }
}

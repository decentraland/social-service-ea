import { resolve } from 'path'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@dcl/http-server'
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
  createCommunityPostsComponent,
  createCommunityRankingComponent
} from './logic/community'
import { createReferralDBComponent } from './adapters/referral-db'
import { createReferralComponent } from './logic/referral'
import { createMemoryQueueComponent } from '@dcl/memory-queue-component'
import { createPeersStatsComponent } from './logic/peers-stats'
import { createS3Adapter } from './adapters/s3'
import { createJobComponent } from '@dcl/job-component'
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
import { createQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { createSqsComponent } from '@dcl/sqs-component'
import { createSnsComponent } from '@dcl/sns-component'
import { createSchemaValidatorComponent } from '@dcl/schema-validator-component'
import { createRegistryComponent } from './adapters/registry'
import { createSqsHandlers } from './controllers/handlers/sqs/handler'

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
  const schemaValidator = createSchemaValidatorComponent({ ensureJsonContentType: false })

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
  const registry = await createRegistryComponent({ fetcher, config, redis, logs })
  const catalystClient = await createCatalystClient({ config, fetcher })
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
  const subscribersContext = createSubscribersContext({ redis, logs })
  const peersStats = createPeersStatsComponent({ archipelagoStats, worldsStats })
  const communityThumbnail = await createCommunityThumbnailComponent({ config, storage })

  const communityBroadcaster = createCommunityBroadcasterComponent({ sns, communitiesDb, subscribersContext })
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
    registry,
    communityVoiceChatCache,
    placesApi,
    communityThumbnail,
    communityPlaces,
    communityBroadcaster
  })
  const communityMembers = await createCommunityMembersComponent({
    communitiesDb,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    registry,
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
    registry,
    pubsub,
    commsGatekeeper,
    analytics
  })
  const communityOwners = createCommunityOwnersComponent({ registry })
  const communityEvents = await createCommunityEventsComponent({ config, logs, fetcher, redis })

  // AI Compliance components
  const aiCompliance = await createAIComplianceComponent({ config, logs, featureFlags, metrics, redis })
  const communityComplianceValidator = createCommunityComplianceValidatorComponent({ aiCompliance, featureFlags, logs })

  const communities = createCommunityComponent({
    communitiesDb,
    registry,
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
    registry,
    pubsub,
    logs,
    analytics
  })

  const communityPosts = createCommunityPostsComponent({
    communitiesDb,
    communityRoles,
    registry,
    logs,
    communityBroadcaster,
    communityThumbnail
  })

  const communityRanking = createCommunityRankingComponent({ logs, communitiesDb })

  const communityRankingCalculationJob = createJobComponent(
    { logs },
    communityRanking.calculateRankingScoreForAllCommunities,
    24 * 60 * 60 * 1000, // 24 hours in milliseconds
    { repeat: true, startupDelay: 30 * 60 * 1000 } // Start after 30 minutes delay
  )

  const friends = await createFriendsComponent({ friendsDb, registry, pubsub, sns, logs })
  const updateHandler = createUpdateHandlerComponent({
    logs,
    subscribersContext,
    friendsDb,
    communityMembers,
    registry
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
  const queue = sqsEndpoint ? await createSqsComponent(config) : createMemoryQueueComponent()

  const slackToken = await config.requireString('SLACK_BOT_TOKEN')
  const slack = await createSlackComponent({ logs }, { token: slackToken })

  const referral = await createReferralComponent({ referralDb, logs, sns, config, rewards, email, slack, redis })

  const queueProcessor = createQueueConsumerComponent({ sqs: queue, logs })
  createSqsHandlers({ logs, referral, communitiesDb, queueProcessor })

  return {
    aiCompliance,
    analytics,
    archipelagoStats,
    registry,
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
    communityRankingCalculationJob,
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
    queueProcessor,
    metrics,
    nats,
    peerTracking,
    peersStats,
    peersSynchronizer,
    pg,
    placesApi,
    pubsub,
    queue,
    communityRanking,
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
    wsPool,
    schemaValidator
  }
}

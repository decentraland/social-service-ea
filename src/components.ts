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
import { createSnsComponent } from './adapters/sns'
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
  createCommunityOwnersComponent
} from './logic/community'
import { createReferralDBComponent } from './adapters/referral-db'
import { createReferralComponent } from './logic/referral'
import { createMessageProcessorComponent, createMessagesConsumerComponent } from './logic/sqs'
import { createSqsAdapter } from './adapters/sqs'
import { createMemoryQueueAdapter } from './adapters/memory-queue'
import { createPeersStatsComponent } from './logic/peers-stats'
import { createS3Adapter } from './adapters/s3'
import { createCommunityPlacesComponent } from './logic/community'
import { createJobComponent } from './logic/job'
import { createPlacesApiAdapter } from './adapters/places-api'
import { createUpdateHandlerComponent } from './logic/updates'
import { AnalyticsEventPayload } from './types/analytics'
import { createRewardComponent } from './adapters/rewards'
import { createWsPoolComponent } from './logic/ws-pool'
import { createCdnCacheInvalidatorComponent } from './adapters/cdn-cache-invalidator'
import { createEmailComponent } from './adapters/email'

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
  const referralDb = await createReferralDBComponent({ pg, logs })
  const analytics = await createAnalyticsComponent<AnalyticsEventPayload>({ logs, fetcher, config })
  const sns = await createSnsComponent({ config })

  const email = await createEmailComponent({ fetcher, config })
  const rewards = await createRewardComponent({ fetcher, config })
  const referral = await createReferralComponent({ referralDb, logs, sns, config, rewards, email })

  const placesApi = await createPlacesApiAdapter({ fetcher, config })
  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, fetcher, redis })
  const worldsStats = await createWorldsStatsComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const commsGatekeeper = await createCommsGatekeeperComponent({ logs, config, fetcher })
  const catalystClient = await createCatalystClient({ config, fetcher, redis })
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
  const communityVoice = await createCommunityVoiceComponent({
    logs,
    commsGatekeeper,
    communitiesDb,
    pubsub,
    analytics,
    catalystClient
  })
  const storage = await createS3Adapter({ config })
  const subscribersContext = createSubscribersContext()
  const peersStats = createPeersStatsComponent({ archipelagoStats, worldsStats })
  const communityRoles = createCommunityRolesComponent({ communitiesDb, logs })
  const communityPlaces = await createCommunityPlacesComponent({ communitiesDb, communityRoles, logs, placesApi })
  const communityMembers = await createCommunityMembersComponent({
    communitiesDb,
    communityRoles,
    logs,
    catalystClient,
    peersStats,
    pubsub
  })
  const communityBans = await createCommunityBansComponent({
    communitiesDb,
    communityRoles,
    logs,
    catalystClient,
    pubsub
  })
  const communityOwners = createCommunityOwnersComponent({ catalystClient })
  const communities = await createCommunityComponent({
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    communityOwners,
    cdnCacheInvalidator,
    logs,
    storage,
    config,
    commsGatekeeper
  })
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
  const sqsEndpoint = await config.getString('AWS_SQS_ENDPOINT')
  const queue = sqsEndpoint ? await createSqsAdapter(sqsEndpoint) : createMemoryQueueAdapter()

  const messageProcessor = await createMessageProcessorComponent({ logs, referral })

  const messageConsumer = createMessagesConsumerComponent({
    logs,
    queue,
    messageProcessor
  })

  return {
    analytics,
    archipelagoStats,
    catalystClient,
    commsGatekeeper,
    communities,
    communitiesDb,
    communityBans,
    communityOwners,
    communityMembers,
    communityPlaces,
    communityRoles,
    communityVoice,
    config,
    email,
    expirePrivateVoiceChatJob,
    fetcher,
    friendsDb,
    httpServer,
    logs,
    messageConsumer,
    messageProcessor,
    metrics,
    nats,
    peersStats,
    peersSynchronizer,
    peerTracking,
    pg,
    placesApi,
    pubsub,
    queue,
    redis,
    referral,
    referralDb,
    rewards,
    rpcServer,
    settings,
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
    cdnCacheInvalidator
  }
}

// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { resolve } from 'path'
import {
  createRunner,
  createLocalFetchCompoment as createLocalFetchComponent
} from '@well-known-components/test-helpers'
import { createConfigComponent, createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createLogComponent } from '@well-known-components/logger'
import { createUWsComponent } from '@well-known-components/uws-http-server'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createAnalyticsComponent } from '@dcl/analytics-component'
import { createPgComponent } from '../src/adapters/pg'

import { main } from '../src/service'
import { GlobalContext, TestComponents } from '../src/types'
import { createFriendsDBComponent } from '../src/adapters/friends-db'
import { createVoiceDBComponent } from '../src/adapters/voice-db'
import { createCommunitiesDBComponent } from '../src/adapters/communities-db'
import { createRedisComponent } from '../src/adapters/redis'
import { createPubSubComponent } from '../src/adapters/pubsub'
import { createNatsComponent } from '@well-known-components/nats-component'
import { createCatalystClient } from '../src/adapters/catalyst-client'
import { createS3Adapter } from '../src/adapters/s3'
import { createRpcServerComponent, createSubscribersContext } from '../src/adapters/rpc-server'
import { createCommsGatekeeperComponent } from '../src/adapters/comms-gatekeeper'
import { createPeerTrackingComponent } from '../src/adapters/peer-tracking'
import { createArchipelagoStatsComponent } from '../src/adapters/archipelago-stats'
import { ARCHIPELAGO_STATS_URL } from './mocks/components/archipelago-stats'
import { createWorldsStatsComponent } from '../src/adapters/worlds-stats'
import { createPlacesApiAdapter } from '../src/adapters/places-api'
import { metricDeclarations } from '../src/metrics'
import { createRpcClientComponent } from './integration/utils/rpc-client'
import {
  mockPeersSynchronizer,
  mockCdnCacheInvalidator,
  createSNSMockedComponent,
  createAIComplianceMock
} from './mocks/components'
import { mockTracing } from './mocks/components/tracing'
import { createServerComponent } from '@well-known-components/http-server'
import { createStatusCheckComponent } from '@well-known-components/http-server'
import {
  createCommunityBansComponent,
  createCommunityComponent,
  createCommunityMembersComponent,
  createCommunityPlacesComponent,
  createCommunityRolesComponent,
  createCommunityOwnersComponent,
  createCommunityEventsComponent,
  createCommunityThumbnailComponent,
  createCommunityComplianceValidatorComponent,
  createCommunityFieldsValidatorComponent,
  createCommunityRequestsComponent
} from '../src/logic/community'
import { createDbHelper } from './helpers/community-db-helper'
import { createVoiceComponent } from '../src/logic/voice'
import { createCommunityVoiceComponent } from '../src/logic/community-voice'
import { createCommunityVoiceChatCacheComponent } from '../src/logic/community-voice/community-voice-cache'
import { createCommunityVoiceChatPollingComponent } from '../src/logic/community-voice/community-voice-polling'
import { createSettingsComponent } from '../src/logic/settings'
import { createMessageProcessorComponent, createMessagesConsumerComponent } from '../src/logic/sqs'
import { createReferralDBComponent } from '../src/adapters/referral-db'
import { createReferralComponent } from '../src/logic/referral/referral'
import { createMemoryQueueAdapter } from '../src/adapters/memory-queue'
import { createPeersStatsComponent } from '../src/logic/peers-stats'
import { createStorageHelper } from './integration/utils/storage'
import { createUpdateHandlerComponent } from '../src/logic/updates'
import { AnalyticsEventPayload } from '../src/types/analytics'
import { createRewardComponent } from '../src/adapters/rewards'
import { createWsPoolComponent } from '../src/logic/ws-pool'
import { createEmailComponent } from '../src/adapters/email'
import { createFriendsComponent } from '../src/logic/friends'
import { createSlackComponent } from '@dcl/slack-component'
import { createFeaturesComponent } from '@well-known-components/features-component'
import { createFeatureFlagsAdapter } from '../src/adapters/feature-flags'
import { createInMemoryCacheComponent } from '../src/adapters/memory-cache'
import { createMockCommunityBroadcasterComponent } from './mocks/communities'

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<TestComponents>({
  main,
  initComponents
})

async function initComponents(): Promise<TestComponents> {
  const config = await createDotEnvConfigComponent(
    {
      path: ['.env.default', '.env.test']
    },
    {
      ARCHIPELAGO_STATS_URL
    }
  )

  const uwsHttpServerConfig = createConfigComponent({
    HTTP_SERVER_PORT: await config.requireString('UWS_SERVER_PORT'),
    HTTP_SERVER_HOST: await config.requireString('HTTP_SERVER_HOST')
  })

  const apiSeverConfig = createConfigComponent({
    HTTP_SERVER_PORT: await config.requireString('API_HTTP_SERVER_PORT'),
    HTTP_SERVER_HOST: await config.requireString('HTTP_SERVER_HOST')
  })

  const metrics = createTestMetricsComponent(metricDeclarations)
  const logs = await createLogComponent({ metrics, config })

  const uwsServer = await createUWsComponent({ config: uwsHttpServerConfig, logs })
  const httpServer = await createServerComponent<GlobalContext>(
    { config: apiSeverConfig, logs },
    {
      cors: {
        methods: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT', 'PATCH'],
        maxAge: 86400
      }
    }
  )
  const fetcher = createFetchComponent()
  const memoryCache = createInMemoryCacheComponent()

  const statusChecks = await createStatusCheckComponent({ server: httpServer, config })

  let databaseUrl: string = await config.requireString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  const pg = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl,
        dir: resolve(__dirname, '../src/migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up',
        verbose: false
      }
    }
  )
  const friendsDb = createFriendsDBComponent({ pg, logs })
  const communitiesDb = createCommunitiesDBComponent({ pg, logs })
  const voiceDb = await createVoiceDBComponent({ pg, config })

  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const catalystClient = await createCatalystClient({ config, fetcher, redis, logs })
  const sns = createSNSMockedComponent({})
  const storage = await createS3Adapter({ config })
  const subscribersContext = createSubscribersContext()
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, redis, fetcher })
  const worldsStats = await createWorldsStatsComponent({ logs, redis })
  const commsGatekeeper = await createCommsGatekeeperComponent({ logs, config, fetcher })
  const settings = await createSettingsComponent({ friendsDb })
  const analytics = await createAnalyticsComponent<AnalyticsEventPayload>({ logs, fetcher, config })
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
  const peersStats = createPeersStatsComponent({ archipelagoStats, worldsStats })
  const communityRoles = createCommunityRolesComponent({ communitiesDb, logs })
  const placesApi = await createPlacesApiAdapter({ fetcher, config })
  const communityThumbnail = await createCommunityThumbnailComponent({ config, storage })
  // Use mock broadcaster to avoid database calls during async operations
  const communityBroadcaster = createMockCommunityBroadcasterComponent({})
  const communityPlaces = await createCommunityPlacesComponent({ communitiesDb, communityRoles, logs, placesApi })
  const communityFieldsValidator = await createCommunityFieldsValidatorComponent({ config })

  // Community voice chat cache and polling components
  const communityVoiceChatCache = createCommunityVoiceChatCacheComponent({ logs, redis })
  const communityVoiceChatPolling = createCommunityVoiceChatPollingComponent({
    logs,
    commsGatekeeper,
    pubsub,
    communityVoiceChatCache
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
    commsGatekeeper
  })
  const communityBans = await createCommunityBansComponent({
    communitiesDb,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    catalystClient,
    pubsub,
    commsGatekeeper
  })
  const communityOwners = createCommunityOwnersComponent({ catalystClient })
  const communityEvents = await createCommunityEventsComponent({ config, logs, fetcher, redis })
  const aiCompliance = createAIComplianceMock({})
  const features = await createFeaturesComponent(
    { config, logs, fetch: fetcher },
    'https://social-service-ea.decentraland.test'
  )
  const featureFlags = await createFeatureFlagsAdapter({ config, logs, features })
  const communityComplianceValidator = createCommunityComplianceValidatorComponent({ aiCompliance, featureFlags, logs })
  const communities = createCommunityComponent({
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    communityOwners,
    communityEvents,
    communityBroadcaster,
    communityThumbnail,
    cdnCacheInvalidator: mockCdnCacheInvalidator,
    commsGatekeeper,
    communityComplianceValidator,
    featureFlags,
    pubsub,
    logs
  })
  const updateHandler = createUpdateHandlerComponent({
    logs,
    subscribersContext,
    friendsDb,
    communityMembers,
    catalystClient
  })
  const communityVoice = await createCommunityVoiceComponent({
    logs,
    commsGatekeeper,
    pubsub,
    analytics,
    communitiesDb,
    catalystClient,
    communityVoiceChatCache,
    placesApi,
    communityThumbnail,
    communityPlaces
  })
  const communityRequests = createCommunityRequestsComponent({
    communitiesDb,
    communities,
    communityRoles,
    communityBroadcaster,
    communityThumbnail,
    catalystClient,
    pubsub,
    logs
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
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config, worldsStats })

  const localUwsFetch = await createLocalFetchComponent(uwsHttpServerConfig)
  const localHttpFetch = await createLocalFetchComponent(apiSeverConfig)

  const rpcClient = await createRpcClientComponent({ config, logs })

  const communitiesDbHelper = createDbHelper(pg)

  const referralDb = await createReferralDBComponent({ pg, logs, config })

  const rewards = await createRewardComponent({ fetcher, config })

  const email = await createEmailComponent({ fetcher, config })

  const slack = await createSlackComponent(
    { logs },
    {
      token: 'sometoken'
    }
  )

  const referral = await createReferralComponent({ referralDb, logs, sns, config, rewards, email, slack, redis })

  const queue = createMemoryQueueAdapter()

  const messageProcessor = await createMessageProcessorComponent({
    logs,
    referral
  })

  const messageConsumer = createMessagesConsumerComponent({
    logs,
    queue,
    messageProcessor
  })

  const storageHelper = await createStorageHelper({ config })

  const wsPool = createWsPoolComponent({ logs, metrics })

  const friends = await createFriendsComponent({ friendsDb, catalystClient, pubsub, sns, logs })

  return {
    aiCompliance,
    analytics,
    archipelagoStats,
    catalystClient,
    cdnCacheInvalidator: mockCdnCacheInvalidator,
    commsGatekeeper,
    communities,
    communitiesDb,
    communitiesDbHelper,
    communityBans,
    communityBroadcaster,
    communityComplianceValidator,
    communityEvents,
    communityFieldsValidator,
    communityMembers,
    communityOwners,
    communityPlaces,
    communityRequests,
    communityRoles,
    communityThumbnail,
    communityVoice,
    communityVoiceChatCache,
    communityVoiceChatPolling,
    config,
    email,
    features,
    featureFlags,
    fetcher,
    friends,
    friendsDb,
    httpServer,
    localHttpFetch,
    localUwsFetch,
    logs,
    memoryCache,
    messageConsumer,
    messageProcessor,
    metrics,
    nats,
    peerTracking,
    peersStats,
    peersSynchronizer: mockPeersSynchronizer,
    pg,
    placesApi,
    pubsub,
    queue,
    redis,
    referral,
    referralDb,
    rewards,
    rpcClient,
    rpcServer,
    settings,
    slack,
    sns,
    statusChecks,
    storage,
    storageHelper,
    subscribersContext,
    tracing: mockTracing,
    updateHandler,
    uwsServer,
    voice,
    voiceDb,
    worldsStats,
    wsPool
  }
}

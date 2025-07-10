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
import { createSnsComponent } from '../src/adapters/sns'
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
import { mockPeersSynchronizer } from './mocks/components'
import { mockTracing } from './mocks/components/tracing'
import { createServerComponent } from '@well-known-components/http-server'
import { createStatusCheckComponent } from '@well-known-components/http-server'
import {
  createCommunityBansComponent,
  createCommunityComponent,
  createCommunityMembersComponent,
  createCommunityPlacesComponent,
  createCommunityRolesComponent,
  createCommunityOwnersComponent
} from '../src/logic/community'
import { createDbHelper } from './helpers/community-db-helper'
import { createVoiceComponent } from '../src/logic/voice'
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
  const uwsHttpServerConfig = await createConfigComponent({
    HTTP_SERVER_PORT: await config.requireString('UWS_HTTP_SERVER_PORT'),
    HTTP_SERVER_HOST: await config.requireString('HTTP_SERVER_HOST')
  })
  const metrics = createTestMetricsComponent(metricDeclarations)
  const logs = await createLogComponent({ metrics, config })

  const uwsServer = await createUWsComponent({ config: uwsHttpServerConfig, logs })
  const httpServer = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        methods: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT', 'PATCH'],
        maxAge: 86400
      }
    }
  )
  const fetcher = createFetchComponent()

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
        direction: 'up'
      }
    }
  )
  const friendsDb = createFriendsDBComponent({ pg, logs })
  const communitiesDb = createCommunitiesDBComponent({ pg, logs })
  const voiceDb = await createVoiceDBComponent({ pg, config })

  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const catalystClient = await createCatalystClient({ config, fetcher, redis })
  const sns = await createSnsComponent({ config })
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
    logs,
    storage,
    config
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
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config, worldsStats })

  const localUwsFetch = await createLocalFetchComponent(uwsHttpServerConfig)
  const localHttpFetch = await createLocalFetchComponent(config)

  const rpcClient = await createRpcClientComponent({ config, logs })

  const communitiesDbHelper = createDbHelper(pg)

  const referralDb = await createReferralDBComponent({ pg, logs })

  const rewards = await createRewardComponent({ fetcher, config })

  const referral = await createReferralComponent({ referralDb, logs, sns, config, rewards })

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

  return {
    analytics,
    archipelagoStats,
    catalystClient,
    commsGatekeeper,
    communities,
    communitiesDb,
    communitiesDbHelper,
    communityBans,
    communityMembers,
    communityPlaces,
    communityOwners,
    communityRoles,
    config,
    fetcher,
    friendsDb,
    httpServer,
    localHttpFetch,
    localUwsFetch,
    logs,
    messageConsumer,
    messageProcessor,
    metrics,
    nats,
    peersStats,
    peersSynchronizer: mockPeersSynchronizer,
    peerTracking,
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

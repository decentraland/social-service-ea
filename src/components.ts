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
import { createWSPoolComponent } from './adapters/ws-pool'
import { createWorldsStatsComponent } from './adapters/worlds-stats'
import { createTracingComponent } from './adapters/tracing'
import { createCommsGatekeeperComponent } from './adapters/comms-gatekeeper'
import { createVoiceComponent } from './logic/voice'
import { createSettingsComponent } from './logic/settings'
import { createCommunitiesDBComponent } from './adapters/communities-db'
import { createVoiceDBComponent } from './adapters/voice-db'
import { createCommunityComponent, createCommunityRolesComponent } from './logic/community'
import { createPeersStatsComponent } from './logic/peers-stats'
import { createS3Adapter } from './adapters/s3'
import { createCommunityPlacesComponent } from './logic/community'

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

  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, fetcher, redis })
  const worldsStats = await createWorldsStatsComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const commsGatekeeper = await createCommsGatekeeperComponent({ logs, config, fetcher })
  const catalystClient = await createCatalystClient({ config, fetcher, logs })
  const settings = await createSettingsComponent({ friendsDb })
  const voiceDb = await createVoiceDBComponent({ pg, config })
  const voice = await createVoiceComponent({ logs, voiceDb, friendsDb, commsGatekeeper, settings, pubsub })
  const sns = await createSnsComponent({ config })
  const storage = await createS3Adapter({ config })
  const subscribersContext = createSubscribersContext()
  const peersStats = createPeersStatsComponent({ archipelagoStats, worldsStats })
  const rpcServer = await createRpcServerComponent({
    logs,
    commsGatekeeper,
    friendsDb,
    pubsub,
    uwsServer,
    config,
    catalystClient,
    sns,
    subscribersContext,
    metrics,
    settings,
    voice,
    peersStats
  })
  const wsPool = await createWSPoolComponent({ metrics, config, redis, logs })
  const peersSynchronizer = await createPeersSynchronizerComponent({ logs, archipelagoStats, redis, config })
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config, worldsStats })
  const communityRoles = createCommunityRolesComponent({ communitiesDb, logs })
  const communityPlaces = await createCommunityPlacesComponent({ communitiesDb, communityRoles, logs })
  const community = await createCommunityComponent({
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    logs,
    peersStats,
    storage,
    config
  })

  return {
    archipelagoStats,
    catalystClient,
    commsGatekeeper,
    community,
    communityPlaces,
    communityRoles,
    config,
    friendsDb,
    communitiesDb,
    fetcher,
    httpServer,
    logs,
    metrics,
    nats,
    peerTracking,
    peersStats,
    peersSynchronizer,
    pg,
    pubsub,
    redis,
    rpcServer,
    settings,
    sns,
    statusChecks,
    storage,
    subscribersContext,
    tracing,
    uwsServer,
    voiceDb,
    voice,
    wsPool,
    worldsStats
  }
}

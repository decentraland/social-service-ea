import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createPgComponent } from '@well-known-components/pg-component'
import { AppComponents } from './types'
import { metricDeclarations } from './metrics'
import { createDBComponent } from './adapters/db'
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

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.test', '.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics })

  const server = await createUWsComponent({ config, logs })

  const fetcher = createFetchComponent()

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

  const db = createDBComponent({ pg, logs })

  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, fetcher, redis })
  const nats = await createNatsComponent({ logs, config })
  const catalystClient = await createCatalystClient({ config, fetcher, logs })
  const sns = await createSnsComponent({ config })
  const subscribersContext = createSubscribersContext()
  const rpcServer = await createRpcServerComponent({
    logs,
    db,
    pubsub,
    server,
    config,
    archipelagoStats,
    catalystClient,
    sns,
    subscribersContext
  })
  const wsPool = await createWSPoolComponent({ metrics, config, redis, logs })
  const peersSynchronizer = await createPeersSynchronizerComponent({ logs, archipelagoStats, redis, config })
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config })

  return {
    config,
    logs,
    server,
    metrics,
    pg,
    db,
    fetcher,
    redis,
    pubsub,
    rpcServer,
    archipelagoStats,
    peersSynchronizer,
    nats,
    peerTracking,
    catalystClient,
    sns,
    wsPool,
    subscribersContext
  }
}

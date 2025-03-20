// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { resolve } from 'path'
import { createRunner, createLocalFetchCompoment } from '@well-known-components/test-helpers'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createLogComponent } from '@well-known-components/logger'
import { createUWsComponent } from '@well-known-components/uws-http-server'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createPgComponent } from '@well-known-components/pg-component'

import { main } from '../src/service'
import { TestComponents } from '../src/types'
import { createDBComponent } from '../src/adapters/db'
import { createRedisComponent } from '../src/adapters/redis'
import { createPubSubComponent } from '../src/adapters/pubsub'
import { createNatsComponent } from '@well-known-components/nats-component'
import { createCatalystClient } from '../src/adapters/catalyst-client'
import { createSnsComponent } from '../src/adapters/sns'
import { createRpcServerComponent, createSubscribersContext } from '../src/adapters/rpc-server'
import { createWSPoolComponent } from '../src/adapters/ws-pool'
import { createPeersSynchronizerComponent } from '../src/adapters/peers-synchronizer'
import { createPeerTrackingComponent } from '../src/adapters/peer-tracking'
import { createArchipelagoStatsComponent } from '../src/adapters/archipelago-stats'
import { ARCHIPELAGO_STATS_URL } from './mocks/components/archipelago-stats'
import { createWorldsStatsComponent } from '../src/adapters/worlds-stats'
import { metricDeclarations } from '../src/metrics'
import { createRpcClientComponent } from './integration/utils/rpc-client'
import { mockPeersSynchronizer } from './mocks/components'

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
      path: ['.env.test']
    },
    {
      ARCHIPELAGO_STATS_URL
    }
  )
  const metrics = createTestMetricsComponent(metricDeclarations)
  const logs = await createLogComponent({ metrics, config })

  const server = await createUWsComponent({ config, logs })
  const fetcher = createFetchComponent()

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
  const db = createDBComponent({ pg, logs })

  const redis = await createRedisComponent({ logs, config })
  const pubsub = createPubSubComponent({ logs, redis })
  const nats = await createNatsComponent({ logs, config })
  const catalystClient = await createCatalystClient({ config, fetcher, logs })
  const sns = await createSnsComponent({ config })
  const subscribersContext = createSubscribersContext()
  const archipelagoStats = await createArchipelagoStatsComponent({ logs, config, redis, fetcher })
  const worldsStats = await createWorldsStatsComponent({ logs, redis })
  const rpcServer = await createRpcServerComponent({
    logs,
    db,
    pubsub,
    server,
    config,
    archipelagoStats,
    catalystClient,
    sns,
    subscribersContext,
    worldsStats,
    metrics
  })
  const wsPool = await createWSPoolComponent({ metrics, config, redis, logs })
  const peerTracking = await createPeerTrackingComponent({ logs, pubsub, nats, redis, config, worldsStats })

  const localFetch = await createLocalFetchCompoment(config)

  const rpcClient = await createRpcClientComponent({ config, logs })

  return {
    archipelagoStats,
    catalystClient,
    config,
    db,
    fetcher,
    localFetch,
    logs,
    metrics,
    nats,
    peerTracking,
    peersSynchronizer: mockPeersSynchronizer,
    pg,
    pubsub,
    redis,
    rpcClient,
    rpcServer,
    server,
    sns,
    subscribersContext,
    worldsStats,
    wsPool
  }
}

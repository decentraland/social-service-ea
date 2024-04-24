import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createPgComponent } from '@well-known-components/pg-component'
import { AppComponents } from './types'
import { metricDeclarations } from './metrics'
import { createDBComponent } from './adapters/db'
import createRpcServerComponent from './adapters/rpcServer'
import createRedisComponent from './adapters/redis'
import createPubSubComponent from './adapters/pubsub'
import { createUWsComponent } from '@well-known-components/uws-http-server'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
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
  const rpcServer = await createRpcServerComponent({ logs, db, pubsub })

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
    rpcServer
  }
}

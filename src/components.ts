import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createPgComponent } from '@well-known-components/pg-component'
import { AppComponents, GlobalContext } from './types'
import { metricDeclarations } from './metrics'
import { createDBComponent } from './adapters/db'
import { createWsComponent } from './adapters/ws'
import createRpcServerComponent from './adapters/rpcServer'
import createRedisComponent from './adapters/redis'
import createPubSubComponent from './adapters/pubsub'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics })

  const ws = await createWsComponent()
  const server = await createServerComponent<GlobalContext>({ config, logs, ws: ws.ws }, {})
  const statusChecks = await createStatusCheckComponent({ server, config })

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

  await instrumentHttpServerWithPromClientRegistry({ metrics, server, config, registry: metrics.registry! })

  return {
    config,
    logs,
    server,
    statusChecks,
    metrics,
    pg,
    db,
    ws,
    fetcher,
    redis,
    pubsub,
    rpcServer
  }
}

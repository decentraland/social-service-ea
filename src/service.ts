import { Lifecycle } from '@well-known-components/interfaces'
import { AppComponents, GlobalContext, TestComponents } from './types'
import { setupHttpRoutes, setupUWSRoutes, setupRpcRoutes } from './controllers/routes'
import { startMemoryMonitoring } from './utils/memory-debug'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>) {
  const { components, startComponents } = program

  const globalContext: GlobalContext = {
    components
  }

  // wire the HTTP router (make it automatic? TBD)
  const router = await setupHttpRoutes(globalContext)
  // register routes middleware
  components.httpServer.use(router.middleware())
  // register not implemented/method not allowed/cors response middleware
  components.httpServer.use(router.allowedMethods())
  // set the context to be passed to the handlers
  components.httpServer.setContext(globalContext)

  // wire the UWS routes
  await setupUWSRoutes(components)

  // wire the RPC routes
  const rpcServiceCreators = await setupRpcRoutes(components)
  components.rpcServer.setServiceCreators(rpcServiceCreators)

  await startComponents()

  const { peerTracking, peersSynchronizer, config, logs } = components

  await peerTracking.subscribeToPeerStatusUpdates()
  await peersSynchronizer.syncPeers()

  // Start memory monitoring when MEMORY_DEBUG is enabled
  const memoryDebug = (await config.getString('MEMORY_DEBUG')) === 'true'
  if (memoryDebug) {
    const logger = logs.getLogger('memory-debug')
    const intervalMs = Number((await config.getString('MEMORY_DEBUG_INTERVAL_MS')) || '30000')
    logger.info(`Memory debugging enabled. Logging stats every ${intervalMs}ms`)
    logger.info('Debug endpoints available: GET /debug/memory, POST /debug/heap-snapshot, POST /debug/gc')
    startMemoryMonitoring(logger, intervalMs)
  }
}

import { Lifecycle } from '@well-known-components/interfaces'
import { setupUWSRoutes } from './controllers/routes/uws.routes'
import { setupRpcRoutes } from './controllers/routes/rpc.routes'
import { AppComponents, GlobalContext, TestComponents } from './types'
import { setupHttpRoutes } from './controllers/routes'

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

  const { peerTracking, peersSynchronizer } = components

  await peerTracking.subscribeToPeerStatusUpdates()
  await peersSynchronizer.syncPeers()
}

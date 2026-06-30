import { createRpcClient, TransportEvents } from '@dcl/rpc'
import { loadService } from '@dcl/rpc/dist/codegen'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createTestIdentity, createAuthHeaders, Identity } from './auth'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'
import { IRpcClient, type TestComponents } from '../../../src/types'
import { createWebSocketTransport, Transport } from './transport'

/**
 * Connects a single authenticated RPC client over a real WebSocket using the GIVEN identity.
 * Unlike createRpcClientComponent (which mints a fresh random identity per connect), this lets
 * a test open multiple concurrent connections for the SAME address (e.g. website + client).
 */
export async function connectAuthenticatedRpcClient(
  { config, logs }: Pick<TestComponents, 'config' | 'logs'>,
  identity: Identity
): Promise<{
  client: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  authAddress: string
  close: () => void
}> {
  const logger = logs.getLogger('test:rpc-multi-client')
  const port = await config.getString('RPC_SERVER_PORT')
  const serverUrl = `ws://127.0.0.1:${port}`
  const headers = createAuthHeaders('get', '/', {}, identity)
  const authMessage = new TextEncoder().encode(JSON.stringify(headers))
  const transport = createWebSocketTransport(serverUrl)

  const client = await new Promise<RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>>(
    (resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Connection timeout')), 10000)
      transport.on('connect', async () => {
        try {
          transport.sendMessage(authMessage)
          const rpcClient = await createRpcClient(transport)
          const rpcPort = await rpcClient.createPort('test-multi-client')
          const service = loadService(rpcPort, SocialServiceDefinition)
          clearTimeout(timeoutId)
          resolve(service)
        } catch (error) {
          clearTimeout(timeoutId)
          reject(error as Error)
        }
      })
      transport.on('error', (error) => {
        logger.error('Transport error during connect', { error: (error as Error)?.message })
        clearTimeout(timeoutId)
        reject(error as Error)
      })
    }
  )

  return {
    client,
    authAddress: identity.realAccount.address.toLowerCase(),
    close: () => transport.close()
  }
}

export async function createRpcClientComponent({
  config,
  logs
}: Pick<TestComponents, 'config' | 'logs'>): Promise<IRpcClient> {
  const logger = logs.getLogger('test:rpc-client')
  let socialServiceClient: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  let transport: Transport
  let authAddress: string
  let isShuttingDown = false

  const port = await config.getString('RPC_SERVER_PORT')
  const serverUrl = `ws://127.0.0.1:${port}`

  async function connectWithRetry(retries = 3, delay = 1000): Promise<void> {
    if (isShuttingDown) {
      throw new Error('Client is shutting down')
    }

    for (let i = 0; i < retries; i++) {
      try {
        // Ensure previous transport is cleaned up
        await cleanupTransport()

        const identity = await createTestIdentity()
        const headers = createAuthHeaders('get', '/', {}, identity)
        authAddress = identity.realAccount.address
        const authMessage = new TextEncoder().encode(JSON.stringify(headers))

        transport = createWebSocketTransport(serverUrl)

        await new Promise<void>((resolve, reject) => {
          let timeoutId: NodeJS.Timeout
          let isResolved = false
          let listeners: { event: string; handler: Function }[] = []

          const cleanup = () => {
            clearTimeout(timeoutId)
            // Remove all listeners
            listeners.forEach(({ event, handler }: { event: keyof TransportEvents; handler: Function }) => {
              transport?.off(event, handler as any)
            })
            listeners = []
          }

          const handleMessage = async (message: Uint8Array) => {
            logger.debug('Received message during auth')
          }

          const handleConnect = async () => {
            if (isResolved) return
            try {
              logger.debug('Connected to RPC server, sending auth...')
              transport.sendMessage(authMessage)
              logger.debug('Auth headers sent')

              const client = await createRpcClient(transport)
              const rpcPort = await client.createPort('test-rpc-client')
              socialServiceClient = loadService(rpcPort, SocialServiceDefinition)
              logger.debug('RPC client successfully initialized')

              isResolved = true
              cleanup()
              resolve()
            } catch (error) {
              if (!isResolved) {
                isResolved = true
                cleanup()
                reject(error)
              }
            }
          }

          const handleError = (error: Error) => {
            logger.error('Transport error:', { error: error.message })
            if (!isResolved) {
              isResolved = true
              cleanup()
              reject(error)
            }
          }

          const handleClose = () => {
            logger.debug('Transport closed')
            if (!isResolved) {
              isResolved = true
              cleanup()
              if (!isShuttingDown) {
                reject(new Error('Connection closed unexpectedly'))
              } else {
                resolve()
              }
            }
          }

          timeoutId = setTimeout(() => {
            if (!isResolved) {
              isResolved = true
              cleanup()
              reject(new Error('Connection timeout'))
            }
          }, 10000)

          transport.on('connect', handleConnect)
          transport.on('error', handleError)
          transport.on('close', handleClose)
          transport.on('message', handleMessage)
        })

        return // Connection successful
      } catch (error: any) {
        logger.error(`Connection attempt ${i + 1} failed:`, {
          error: error.message,
          stack: error.stack
        })

        if (i === retries - 1) throw error

        await cleanupTransport()
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  async function cleanupTransport() {
    if (transport) {
      const oldTransport = transport
      transport = undefined as any
      socialServiceClient = undefined as any
      try {
        oldTransport.close()
      } catch (error) {
        logger.error('Error closing transport:', { error })
      }
    }
  }

  return {
    get client() {
      if (!socialServiceClient) {
        throw new Error('RPC client not initialized')
      }
      return socialServiceClient
    },
    get authAddress() {
      if (!authAddress) {
        throw new Error('Auth address not initialized')
      }
      return authAddress
    },
    connect: async () => {
      isShuttingDown = false
      await connectWithRetry()
    },
    stop: async () => {
      isShuttingDown = true
      logger.debug('Stopping RPC client')
      await cleanupTransport()
      logger.debug('RPC client stopped')
    }
  }
}

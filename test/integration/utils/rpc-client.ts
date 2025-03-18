import { createRpcClient } from '@dcl/rpc'
import { loadService } from '@dcl/rpc/dist/codegen'
import { 
  SocialServiceDefinition,
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createTestIdentity, createAuthHeaders } from './auth'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'
import { IRpcClient, type TestComponents } from '../../../src/types'
import { createWebSocketTransport } from './transport'
import type { Transport } from '@dcl/rpc'

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
        await cleanupTransport()

        // Create identity and headers before establishing connection
        const identity = await createTestIdentity()
        const headers = createAuthHeaders('get', '/', {}, identity)
        authAddress = identity.realAccount.address
        const authMessage = new TextEncoder().encode(JSON.stringify(headers))

        transport = createWebSocketTransport(serverUrl)
        
        await new Promise<void>((resolve, reject) => {
          let timeoutId: NodeJS.Timeout
          let isResolved = false

          const cleanup = () => {
            clearTimeout(timeoutId)
          }

          const handleMessage = async (message: Uint8Array) => {
            // Handle any server messages during auth
            logger.debug('Received message during auth')
          }

          const handleConnect = async () => {
            if (isResolved) return
            try {
              logger.debug('Connected to RPC server, sending auth...')
              
              // Send auth immediately after connection
              transport.sendMessage(authMessage)
              logger.debug('Auth headers sent')

              // Add message handler to track auth progress
              transport.on('message', handleMessage)

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
        })

        return // Connection successful
      } catch (error: any) {
        logger.error(`Connection attempt ${i + 1} failed:`, {
          error: error.message,
          stack: error.stack
        })
        
        if (i === retries - 1) throw error
        
        await cleanupTransport()
      }
    }
  }

  async function cleanupTransport() {
    if (transport) {
      const oldTransport = transport
      transport = undefined as any
      socialServiceClient = undefined as any
      oldTransport.close()
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

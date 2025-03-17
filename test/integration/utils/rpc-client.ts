import { createRpcClient } from '@dcl/rpc'
import { loadService } from '@dcl/rpc/dist/codegen'
import { 
  SocialServiceDefinition,
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createTestIdentity, createAuthHeaders } from './auth'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'
import { type TestComponents } from '../../../src/types'
import { createWebSocketTransport } from './transport'
import type { Transport } from '@dcl/rpc'

export interface IRpcClient {
  client: RawClient<FromTsProtoServiceDefinition<typeof SocialServiceDefinition>>
  authAddress: string
  start: () => Promise<void>
  stop: () => void
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
    for (let i = 0; i < retries; i++) {
      try {
        // Ensure previous transport is cleaned up
        if (transport) {
          transport.close()
          transport = undefined as any
          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        transport = createWebSocketTransport(serverUrl)

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'))
          }, 5000)

          transport.on('connect', async () => {
            try {
              clearTimeout(timeout)
              logger.debug('Connected to RPC server')
              
              const identity = await createTestIdentity()
              const headers = createAuthHeaders('get', '/', {}, identity)
              authAddress = identity.realAccount.address
              
              const authMessage = new TextEncoder().encode(JSON.stringify(headers))
              transport.sendMessage(authMessage)
              logger.debug('Auth headers sent')

              // Wait a bit for auth to process
              await new Promise(resolve => setTimeout(resolve, 500))

              const client = await createRpcClient(transport)
              const rpcPort = await client.createPort('test-rpc-client')
              socialServiceClient = loadService(rpcPort, SocialServiceDefinition)
              logger.debug('RPC client successfully initialized')

              resolve()
            } catch (error) {
              clearTimeout(timeout)
              reject(error)
            }
          })

          transport.on('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })

          transport.on('close', () => {
            clearTimeout(timeout)
            if (!socialServiceClient && !isShuttingDown) {
              reject(new Error('Connection closed before initialization'))
            }
          })
        })

        // If we get here, connection was successful
        return
      } catch (error) {
        logger.warn(`Connection attempt ${i + 1} failed:`, error)
        if (i === retries - 1) throw error
        
        // Clean up before retry
        if (transport) {
          transport.close()
          transport = undefined as any
        }
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  return {
    get client() {
      return socialServiceClient!
    },
    get authAddress() {
      return authAddress
    },
    start: async () => {
      isShuttingDown = false
      await connectWithRetry()
    },
    stop: async () => {
      isShuttingDown = true
      logger.debug('closing connection')
      if (transport) {
        transport.close()
        transport = undefined as any
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }
}

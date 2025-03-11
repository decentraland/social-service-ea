import { createRpcClient, RpcClient } from '@dcl/rpc'
import { loadService } from '@dcl/rpc/dist/codegen'
import { createWebSocketsTransport } from './transport'
import type { Transport } from '@dcl/rpc'
import {
  SocialServiceDefinition,
  UpsertFriendshipPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { connect } from 'nats'

export class RpcSocialClient {
  private transport: Transport
  private client: RpcClient | null = null
  private socialService: ReturnType<typeof loadService<SocialServiceDefinition>> | null = null

  constructor(
    private url: string,
    private authChain: Record<string, string | string[] | undefined>
  ) {
    this.transport = createWebSocketsTransport(url)
  }

  /**
   * Connects to the RPC server and authenticates.
   */
  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.transport.on('connect', async () => {
        try {
          console.log('Connected to RPC server.')

          // await new Promise((resolve) => setTimeout(resolve, 10000))

          // Send the authentication chain to the server
          const authMessage = new TextEncoder().encode(JSON.stringify(this.authChain))
          console.log('Sending auth message...')
          this.transport.sendMessage(authMessage)

          console.log('Waiting for auth response...')

          // Initialize the RPC client
          this.client = await createRpcClient(this.transport)
          console.log('RPC client initialized:', this.client)

          // Create an RPC port and load the SocialService module
          const port = await this.client.createPort('rpc-client-port')
          console.log('RPC port created:', port)
          this.socialService = loadService(port, SocialServiceDefinition)
          console.log('Social service loaded:', this.socialService)

          console.log('Authenticated and module loaded.', this.socialService)

          resolve()
        } catch (error) {
          reject(`Error during authentication or module loading: ${error}`)
        }
      })

      this.transport.on('error', (error) => {
        reject(`Transport error: ${error}`)
      })

      this.transport.on('close', (event) => {
        console.log('Connection closed event:', {
          event,
          eventType: typeof event,
          eventKeys: event ? Object.keys(event) : 'no event',
          eventJSON: JSON.stringify(event)
        })

        // If we're still in the auth phase (before sending auth chain)
        if (!this.client) {
          reject(new Error('Authentication timeout - Please retry with valid credentials'))
          return
        }

        // For any other close after authentication
        reject(new Error('Connection closed unexpectedly.'))
      })
    })
  }

  /**
   * Retrieves a list of friends.
   */
  async getFriends(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Fetching friends...', this.socialService)
      const response = await this.socialService.getFriends({
        pagination: {
          limit: 100
        }
      } as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error fetching friends:', error)
      throw error
    }
  }

  /**
   * Retrieves a list of friends.
   */
  async getSentFriendships(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Fetching sent friendships friends...', this.socialService)
      const response = await this.socialService.getSentFriendshipRequests({} as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error fetching friends:', error)
      throw error
    }
  }

  /**
   * Retrieves a list of friends.
   */
  async getPendingFriendships(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Fetching pending friendships friends...', this.socialService)
      const response = await this.socialService.getPendingFriendshipRequests({} as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error fetching friends:', error)
      throw error
    }
  }

  /**
   * Retrieves the status of a friendship.
   */
  async getFriendshipStatus(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Fetching friendship status...', this.socialService)
      const response = await this.socialService.getFriendshipStatus({
        user: {
          address: '0xdde050DF78150f103AdE05Fab55CDE2372C5b7Db'.toLowerCase()
        }
      } as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error fetching friends:', error)
      throw error
    }
  }

  async getMutualFriends(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Fetching mutual friends...', this.socialService)
      const response = await this.socialService.getMutualFriends({
        user: {
          address: '0xdde050DF78150f103AdE05Fab55CDE2372C5b7Db'.toLowerCase()
        },
        pagination: {
          limit: 100,
          offset: 0
        }
      } as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error fetching mutual friends:', error)
      throw error
    }
  }

  async upsertFriendship(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Upserting friendship...', this.socialService)
      const payload: UpsertFriendshipPayload = {
        action: {
          $case: 'accept',
          accept: {
            user: {
              address: '0xdde050DF78150f103AdE05Fab55CDE2372C5b7Db'.toLowerCase()
            }
            // message: "Hi, let's connect!"
          }
        }
      }
      const response = await this.socialService.upsertFriendship(payload as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error upserting friendship:', error)
      throw error
    }
  }

  async subscribeToFriendConnectivityUpdates(): Promise<void> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Subscribing to friend connectivity updates...')
      const subscription = (await this.socialService.subscribeToFriendConnectivityUpdates(
        {} as any
      )) as AsyncIterable<any>
      // Handle the subscription updates
      for await (const update of subscription) {
        console.log('Received friend connectivity update:', {
          address: update.friend?.address,
          status: update.status,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('Error in friend connectivity subscription:', error)
      throw error
    }
  }

  async subscribeToFriendshipUpdates(): Promise<void> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Subscribing to friendship updates...')
      const subscription = (await this.socialService.subscribeToFriendshipUpdates({} as any)) as AsyncIterable<any>
      // Handle the subscription updates
      for await (const update of subscription) {
        console.log('Received friendship update:', update)
      }
    } catch (error) {
      console.error('Error in friend connectivity subscription:', error)
      throw error
    }
  }

  async getBlockedUsers(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Getting blocked users...')
      const response = await this.socialService.getBlockedUsers({} as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error getting blocked users:', error)
      throw error
    }
  }

  async blockUser(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Blocking user...')
      const response = await this.socialService.blockUser({
        user: {
          address: '0xdde050DF78150f103AdE05Fab55CDE2372C5b7Db'.toLowerCase()
        }
      } as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error blocking user:', error)
      throw error
    }
  }

  async unblockUser(): Promise<any> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Unblocking user...')
      const response = await this.socialService.unblockUser({
        user: {
          address: '0xdde050DF78150f103AdE05Fab55CDE2372C5b7Db'.toLowerCase()
        }
      } as any)
      return response // Response will depend on your RPC server's implementation
    } catch (error) {
      console.error('Error unblocking user:', error)
      throw error
    }
  }

  async subscribeToBlockUpdates(): Promise<void> {
    if (!this.socialService) {
      throw new Error('Not connected. Call `connect()` first.')
    }

    try {
      console.log('Subscribing to block updates...')
      const subscription = (await this.socialService.subscribeToBlockUpdates({} as any)) as AsyncIterable<any>
      // Handle the subscription updates
      for await (const update of subscription) {
        console.log('Received block update:', {
          address: update.address,
          isBlocked: update.isBlocked,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('Error in block updates subscription:', error)
      throw error
    }
  }

  /**
   * Closes the connection.
   */
  close(): void {
    this.transport.close()
    console.log('Connection closed.')
  }
}

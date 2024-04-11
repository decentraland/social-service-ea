import { createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import {
  FriendshipsServiceDefinition,
  UsersResponse,
  SubscribeFriendshipEventsUpdatesResponse,
  RequestEventsResponse,
  UpdateFriendshipResponse
} from '../friendships_ea'
import { AppComponents, RpcServerContext } from '../types'

export default function createRpcServerComponent(components: Pick<AppComponents, 'logs'>) {
  const { logs } = components

  const server = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const _logger = logs.getLogger('rpc-server-handler')
  // Mocked server until we get the new service definition & db queries done
  server.setHandler(async function handler(port) {
    registerService(port, FriendshipsServiceDefinition, async () => ({
      getFriends(_request, _context) {
        const generator = async function* () {
          const response: UsersResponse = {
            users: { users: [] }
          }
          yield response
        }

        return generator()
      },
      getMutualFriends(_request, _context) {
        const generator = async function* () {
          const response: UsersResponse = {
            users: { users: [] }
          }
          yield response
        }

        return generator()
      },
      async getRequestEvents(_request, _context) {
        const res: RequestEventsResponse = {
          events: {
            outgoing: { items: [], total: 0 },
            incoming: { items: [], total: 0 }
          }
        }
        return res
      },
      async updateFriendshipEvent(_request, _context) {
        const res: UpdateFriendshipResponse = {
          event: {
            accept: {
              user: {
                address: '0xa'
              }
            }
          }
        }
        return res
      },
      subscribeFriendshipEventsUpdates(_request, _context) {
        const generator = async function* () {
          const response: SubscribeFriendshipEventsUpdatesResponse = {
            events: {
              responses: []
            }
          }
          yield response
        }

        return generator()
      }
    }))
  })

  return server
}

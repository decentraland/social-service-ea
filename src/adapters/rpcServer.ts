import { createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import {
  FriendshipsServiceDefinition,
  UsersResponse,
  SubscribeFriendshipEventsUpdatesResponse
} from '@dcl/protocol/out-ts/decentraland/social/friendships_ea/friendships_ea.gen'
import { AppComponents, RpcServerContext } from '../types'

export default function createRpcServerComponent(components: Pick<AppComponents, 'logs'>) {
  const { logs } = components

  const server = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const _logger = logs.getLogger('rpc-server-handler')
  // Mocked server until we get the new service definition done
  server.setHandler(async function handler(port) {
    registerService(port, FriendshipsServiceDefinition, async () => ({
      getFriends(_request, _context) {
        const generator = async function* () {
          const response: UsersResponse = {
            response: {
              $case: 'users',
              users: { users: [] }
            }
          }
          yield response
        }

        return generator()
      },
      getMutualFriends(_request, _context) {
        const generator = async function* () {
          const response: UsersResponse = {
            response: {
              $case: 'users',
              users: { users: [] }
            }
          }
          yield response
        }

        return generator()
      },
      async getRequestEvents(_request, _context) {
        return {
          response: {
            $case: 'events',
            events: {
              outgoing: { total: 0, items: [] },
              incoming: { total: 0, items: [] }
            }
          }
        }
      },
      async updateFriendshipEvent(_request, _context) {
        return {
          response: {
            $case: 'event',
            event: {
              body: {
                $case: 'accept',
                accept: {
                  user: {
                    address: '0xA'
                  }
                }
              }
            }
          }
        }
      },
      subscribeFriendshipEventsUpdates(_request, _context) {
        const generator = async function* () {
          const response: SubscribeFriendshipEventsUpdatesResponse = {
            response: {
              $case: 'events',
              events: {
                responses: []
              }
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

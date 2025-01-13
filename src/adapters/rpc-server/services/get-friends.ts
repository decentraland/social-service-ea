import { Empty } from '@dcl/protocol/out-ts/google/protobuf/empty.gen'
import { Friendship, RpcServerContext, RPCServiceContext } from '../../../types'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_COUNT_PAGE_STREAM } from '../constants'
import { UsersResponse } from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'

export function getFriendsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function* (_request: Empty, context: RpcServerContext): AsyncGenerator<UsersResponse> {
    logger.debug('getting friends for ', { address: context.address })
    let friendsGenerator: AsyncGenerator<Friendship> | undefined
    try {
      friendsGenerator = db.getFriends(context.address)
    } catch (error) {
      logger.error(error as any)
      // throw an error bc there is no sense to create a generator to send an error
      // as it's done in the previous Social Service
      throw new Error(INTERNAL_SERVER_ERROR)
    }

    const generator = async function* () {
      let users = []
      for await (const friendship of friendsGenerator) {
        const { address_requested, address_requester } = friendship
        if (context.address === address_requested) {
          users.push({ address: address_requester })
        } else {
          users.push({ address: address_requested })
        }

        if (users.length === FRIENDSHIPS_COUNT_PAGE_STREAM) {
          const response = {
            users: [...users]
          }
          users = []
          yield response
        }
      }

      if (users.length) {
        const response = {
          users
        }
        yield response
      }
    }

    return generator()
  }
}

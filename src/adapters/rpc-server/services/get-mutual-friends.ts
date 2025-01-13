import { RpcServerContext, RPCServiceContext } from '../../../types'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_COUNT_PAGE_STREAM } from '../constants'
import {
  MutualFriendsPayload,
  UsersResponse
} from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'
import { normalizeAddress } from '../../../utils/address'

export function getMutualFriendsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-mutual-friends-service')

  return async function* (request: MutualFriendsPayload, context: RpcServerContext): AsyncGenerator<UsersResponse> {
    logger.debug(`getting mutual friends ${context.address}<>${request.user!.address}`)
    let mutualFriends: AsyncGenerator<{ address: string }> | undefined
    try {
      mutualFriends = db.getMutualFriends(context.address, normalizeAddress(request.user!.address))
    } catch (error) {
      logger.error(error as any)
      // throw an error bc there is no sense to create a generator to send an error
      // as it's done in the previous Social Service
      throw new Error(INTERNAL_SERVER_ERROR)
    }

    const generator = async function* () {
      const users = []
      for await (const friendship of mutualFriends) {
        const { address } = friendship
        users.push({ address })
        if (users.length === FRIENDSHIPS_COUNT_PAGE_STREAM) {
          const response = {
            users
          }
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

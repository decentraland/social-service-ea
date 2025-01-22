import { RpcServerContext, RPCServiceContext } from '../../../types'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetMutualFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { normalizeAddress } from '../../../utils/address'
import { getPage } from '../../../utils/pagination'

export function getMutualFriendsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-mutual-friends-service')

  return async function (request: GetMutualFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    logger.debug(`getting mutual friends ${context.address}<>${request.user!.address}`)
    try {
      const { address: requester } = context
      const { pagination, user } = request
      const requested = normalizeAddress(user!.address)
      const [mutualFriends, total] = await Promise.all([
        db.getMutualFriends(requester, requested, pagination),
        db.getMutualFriendsCount(requester, requested)
      ])
      return {
        users: mutualFriends,
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting mutual friends: ${error.message}`)
      return {
        users: [],
        paginationData: {
          total: 0,
          page: 1
        }
      }
    }
  }
}

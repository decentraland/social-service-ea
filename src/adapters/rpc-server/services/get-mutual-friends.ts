import { RpcServerContext, RPCServiceContext } from '../../../types'
import { INTERNAL_SERVER_ERROR, FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetMutualFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'
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
    } catch (error) {
      logger.error(error as any)
      // throw an error bc there is no sense to create a generator to send an error
      // as it's done in the previous Social Service
      throw new Error(INTERNAL_SERVER_ERROR)
    }
  }
}

import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../constants'
import {
  GetFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v3/social_service_v3.gen'

export function getFriendsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (request: GetFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    const { pagination } = request
    const { address: loggedUserAddress } = context

    try {
      const [friends, total] = await Promise.all([
        db.getFriends(loggedUserAddress, { pagination }),
        db.getFriendsCount(loggedUserAddress)
      ])

      return {
        users: friends,
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error) {
      logger.error(error as any)
      throw new Error(INTERNAL_SERVER_ERROR)
    }
  }
}

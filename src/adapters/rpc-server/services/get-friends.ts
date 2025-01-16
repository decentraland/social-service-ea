import { Friendship, RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../constants'
import {
  GetFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'

export function getFriendsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (request: GetFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    const { pagination, status: _status } = request
    try {
      const [friends, total] = await Promise.all([
        db.getFriends(context.address, { pagination }),
        db.getFriendsCount(context.address)
      ])

      // TODO: retrieve peers and filter by connectivity status
      // connecting to NATS and maintaining the same logic as stats/peers

      return {
        users: friends.map((friend: Friendship) => ({ address: friend.address_requested })),
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

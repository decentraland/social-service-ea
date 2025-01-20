import { byConnectivityStatus } from '../../../logic/friendships'
import { Friend, RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { PEERS_CACHE_KEY } from '../../../utils/peers'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../constants'
import {
  ConnectivityStatus,
  GetFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v3/social_service_v3.gen'

export function getFriendsService({ components: { logs, db, redis } }: RPCServiceContext<'logs' | 'db' | 'redis'>) {
  const logger = logs.getLogger('get-friends-service')

  async function getConnectedPeers(): Promise<Record<string, boolean>> {
    try {
      const peersData = await redis.get<Record<string, boolean>>(PEERS_CACHE_KEY)
      return peersData || {}
    } catch (error: any) {
      logger.error('Error fetching peer status:', error)
      return {}
    }
  }

  return async function (request: GetFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    const { pagination, status } = request
    const { address: loggedUserAddress } = context

    try {
      const [friends, total, connectedPeers] = await Promise.all([
        db.getFriends(loggedUserAddress, { pagination }),
        db.getFriendsCount(loggedUserAddress),
        getConnectedPeers()
      ])

      // TODO: how to calculate the total of friends filtered by status?

      return {
        users: typeof status === 'undefined' ? friends : friends.filter(byConnectivityStatus(status, connectedPeers)),
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

import { Friendship, RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE, INTERNAL_SERVER_ERROR } from '../constants'
import {
  ConnectivityStatus,
  GetFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v3/social_service_v3.gen'

export function getFriendsService({
  components: { logs, db, archipelagoStats }
}: RPCServiceContext<'logs' | 'db' | 'archipelagoStats'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (request: GetFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    const { pagination, status } = request
    const { address: loggedUserAddress } = context
    try {
      const [friends, total] = await Promise.all([
        db.getFriends(loggedUserAddress, { pagination }),
        db.getFriendsCount(loggedUserAddress)
      ])

      const peersConnected = await archipelagoStats.getPeers()

      return {
        users: friends
          .filter((friend: Friendship) =>
            status === ConnectivityStatus.ONLINE
              ? peersConnected[friend.address_requested]
              : !peersConnected[friend.address_requested]
          )
          .map((friend) => ({
            address: friend.address_requested === loggedUserAddress ? friend.address_requester : friend.address_requested
          })),
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

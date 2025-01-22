import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetFriendsPayload,
  PaginatedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export async function getFriendsService({
  components: { logs, db, catalystClient, config }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'config'>) {
  const logger = logs.getLogger('get-friends-service')
  const contentServerUrl = await config.requireString('CONTENT_SERVER_URL')

  return async function (request: GetFriendsPayload, context: RpcServerContext): Promise<PaginatedUsersResponse> {
    const { pagination } = request
    const { address: loggedUserAddress } = context

    try {
      // TODO: can use the getPeersFromCache to get the online friends and sort online friends first
      const [friends, total] = await Promise.all([
        db.getFriends(loggedUserAddress, { pagination }),
        db.getFriendsCount(loggedUserAddress)
      ])

      const profiles = await catalystClient.getEntitiesByPointers(friends.map((friend) => friend.address))

      return {
        users: parseProfilesToFriends(profiles, contentServerUrl),
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting friends: ${error.message}`)
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

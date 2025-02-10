import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetFriendsPayload,
  PaginatedFriendsProfilesResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getFriendsService({
  components: { logs, db, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (
    request: GetFriendsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendsProfilesResponse> {
    logger.info('Getting friends', { request: JSON.stringify(request) })

    const { pagination } = request
    const { address: loggedUserAddress } = context

    try {
      // TODO: can use the getPeersFromCache to get the online friends and sort online friends first
      const [friends, total] = await Promise.all([
        db.getFriends(loggedUserAddress, { pagination }),
        db.getFriendsCount(loggedUserAddress)
      ])

      const profiles = await catalystClient.getProfiles(friends.map((friend) => friend.address))

      return {
        friends: parseProfilesToFriends(profiles),
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting friends: ${error.message}`)
      return {
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      }
    }
  }
}

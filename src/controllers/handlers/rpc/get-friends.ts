import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE } from '../../../adapters/rpc-server/constants'
import {
  GetFriendsPayload,
  PaginatedFriendsProfilesResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getFriendsService({
  components: { logs, friendsDb, catalystClient }
}: RPCServiceContext<'logs' | 'friendsDb' | 'catalystClient'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (
    request: GetFriendsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendsProfilesResponse> {
    const { pagination } = request
    const { address: loggedUserAddress } = context

    try {
      const [friends, total] = await Promise.all([
        friendsDb.getFriends(loggedUserAddress, { pagination, onlyActive: true }),
        friendsDb.getFriendsCount(loggedUserAddress, { onlyActive: true })
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

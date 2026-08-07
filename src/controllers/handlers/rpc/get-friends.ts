import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { normalizeFriendsPagination } from '../../../utils/friendship-pagination'
import {
  GetFriendsPayload,
  PaginatedFriendsProfilesResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getFriendsService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-friends-service')

  return async function (
    request: GetFriendsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendsProfilesResponse> {
    const pagination = normalizeFriendsPagination(request.pagination)
    const { address: loggedUserAddress } = context

    try {
      const { friendsProfiles, total } = await friends.getFriendsProfiles(loggedUserAddress, pagination)

      return {
        friends: parseProfilesToFriends(friendsProfiles),
        paginationData: {
          total,
          page: getPage(pagination.limit, pagination.offset)
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

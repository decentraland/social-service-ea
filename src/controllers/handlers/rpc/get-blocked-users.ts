import { parseProfilesToBlockedUsers } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { normalizeBlockedUsersPagination } from '../../../utils/friendship-pagination'
import {
  GetBlockedUsersPayload,
  GetBlockedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getBlockedUsersService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-blocked-users-service')

  return async function (request: GetBlockedUsersPayload, context: RpcServerContext): Promise<GetBlockedUsersResponse> {
    const pagination = normalizeBlockedUsersPagination(request.pagination)
    const { address: loggedUserAddress } = context

    try {
      const { blockedUsers, blockedProfiles, total } = await friends.getBlockedUsers(loggedUserAddress, pagination)

      return {
        profiles: parseProfilesToBlockedUsers(blockedProfiles, blockedUsers),
        paginationData: {
          total,
          page: getPage(pagination.limit, pagination.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting blocked users: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })
      return {
        profiles: [],
        paginationData: {
          total: 0,
          page: 1
        }
      }
    }
  }
}

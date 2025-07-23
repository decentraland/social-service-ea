import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPage } from '../../../utils/pagination'
import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friends/friendships'

export function getPendingFriendshipRequestsService({
  components: { logs, friends }
}: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-pending-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const { limit, offset } = request.pagination || {}
      const { requests, profiles, total } = await friends.getPendingFriendshipRequests(
        context.address,
        request.pagination
      )

      const parsedRequests = parseFriendshipRequestsToFriendshipRequestResponses(requests, profiles)

      return {
        response: {
          $case: 'requests',
          requests: {
            requests: parsedRequests
          }
        },
        paginationData: {
          total,
          page: getPage(limit ?? total, offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting pending friendship requests: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

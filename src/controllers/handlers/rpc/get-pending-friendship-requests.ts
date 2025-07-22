import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPage } from '../../../utils/pagination'

export function getPendingFriendshipRequestsService({
  components: { logs, friendsDb, catalystClient }
}: RPCServiceContext<'logs' | 'friendsDb' | 'catalystClient'>) {
  const logger = logs.getLogger('get-pending-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const { limit, offset } = request.pagination || {}
      const [pendingRequests, pendingRequestsCount] = await Promise.all([
        friendsDb.getReceivedFriendshipRequests(context.address, request.pagination),
        friendsDb.getReceivedFriendshipRequestsCount(context.address)
      ])
      const pendingRequestsAddresses = pendingRequests.map(({ address }) => address)
      const pendingRequesterProfiles = await catalystClient.getProfiles(pendingRequestsAddresses)

      const requests = parseFriendshipRequestsToFriendshipRequestResponses(pendingRequests, pendingRequesterProfiles)

      return {
        response: {
          $case: 'requests',
          requests: {
            requests
          }
        },
        paginationData: {
          total: pendingRequestsCount,
          page: getPage(limit ?? pendingRequestsCount, offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting pending friendship requests: ${error.message}`)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

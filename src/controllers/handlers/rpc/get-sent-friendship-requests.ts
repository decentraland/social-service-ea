import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPage } from '../../../utils/pagination'

export function getSentFriendshipRequestsService({
  components: { logs, friendsDb, catalystClient }
}: RPCServiceContext<'logs' | 'friendsDb' | 'catalystClient'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const { limit, offset } = request.pagination || {}
      const [sentRequests, sentRequestsCount] = await Promise.all([
        friendsDb.getSentFriendshipRequests(context.address, request.pagination),
        friendsDb.getSentFriendshipRequestsCount(context.address)
      ])

      const sentRequestsAddresses = sentRequests.map(({ address }) => address)
      const sentRequestedProfiles = await catalystClient.getProfiles(sentRequestsAddresses)

      const requests = parseFriendshipRequestsToFriendshipRequestResponses(sentRequests, sentRequestedProfiles)

      return {
        response: {
          $case: 'requests',
          requests: {
            requests
          }
        },
        paginationData: {
          total: sentRequestsCount,
          page: getPage(limit ?? sentRequestsCount, offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting sent friendship requests: ${error.message}`)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

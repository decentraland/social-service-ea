import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friendships'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPage } from '../../../utils/pagination'

export async function getPendingFriendshipRequestsService({
  components: { logs, db, catalystClient, config }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'config'>) {
  const logger = logs.getLogger('get-pending-friendship-requests-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const { limit, offset } = request.pagination || {}
      const [pendingRequests, pendingRequestsCount] = await Promise.all([
        db.getReceivedFriendshipRequests(context.address, request.pagination),
        db.getReceivedFriendshipRequestsCount(context.address)
      ])
      const pendingRequestsAddresses = pendingRequests.map(({ address }) => address)
      const pendingRequesterProfiles = await catalystClient.getEntitiesByPointers(pendingRequestsAddresses)

      const requests = parseFriendshipRequestsToFriendshipRequestResponses(
        pendingRequests,
        pendingRequesterProfiles,
        profileImagesUrl
      )

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

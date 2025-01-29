import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friendships'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPage } from '../../../utils/pagination'

export async function getSentFriendshipRequestsService({
  components: { logs, db, catalystClient, config }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'config'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const { limit, offset } = request.pagination || {}
      const [sentRequests, sentRequestsCount] = await Promise.all([
        db.getSentFriendshipRequests(context.address, request.pagination),
        db.getSentFriendshipRequestsCount(context.address)
      ])

      const sentRequestsAddresses = sentRequests.map(({ address }) => address)
      const sentRequestedProfiles = await catalystClient.getEntitiesByPointers(sentRequestsAddresses)

      const requests = parseFriendshipRequestsToFriendshipRequestResponses(
        sentRequests,
        sentRequestedProfiles,
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

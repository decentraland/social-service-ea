import { parseProfileToFriend } from '../../../logic/friends'
import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friendships'
import { getProfileAvatar } from '../../../logic/profiles'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

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
      const pendingRequests = await db.getReceivedFriendshipRequests(context.address, request.pagination)
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

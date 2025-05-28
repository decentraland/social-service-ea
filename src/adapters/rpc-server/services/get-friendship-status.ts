import { getFriendshipRequestStatus } from '../../../logic/friendships'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getFriendshipStatusService({
  components: { logs, friendsDb }
}: RPCServiceContext<'logs' | 'friendsDb'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  return async function (
    request: GetFriendshipStatusPayload,
    context: RpcServerContext
  ): Promise<GetFriendshipStatusResponse> {
    try {
      const { address: loggedUserAddress } = context
      const userAddress = request.user?.address

      if (!userAddress) {
        return {
          response: {
            $case: 'internalServerError',
            internalServerError: { message: 'User address is missing in the request payload' }
          }
        }
      }

      const lastFriendshipAction = await friendsDb.getLastFriendshipActionByUsers(loggedUserAddress, userAddress)

      return {
        response: {
          $case: 'accepted',
          accepted: {
            status: getFriendshipRequestStatus(lastFriendshipAction, loggedUserAddress)
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error getting friendship status: ${error.message}`)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

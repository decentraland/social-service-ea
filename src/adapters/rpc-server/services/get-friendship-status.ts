import { getFriendshipRequestStatus } from '../../../logic/friendships'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getFriendshipStatusService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  return async function (
    request: GetFriendshipStatusPayload,
    context: RpcServerContext
  ): Promise<GetFriendshipStatusResponse> {
    logger.info('Getting friendship status', { request: JSON.stringify(request) })
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

      const lastFriendshipAction = await db.getLastFriendshipActionByUsers(loggedUserAddress, userAddress)

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

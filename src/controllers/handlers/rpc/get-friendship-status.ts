import { EthAddress } from '@dcl/schemas'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { InvalidRequestError } from '../../errors/rpc.errors'

export function getFriendshipStatusService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-friendship-status-service')

  return async function (
    request: GetFriendshipStatusPayload,
    context: RpcServerContext
  ): Promise<GetFriendshipStatusResponse> {
    try {
      const { address: loggedUserAddress } = context
      const userAddress = request.user?.address

      if (!userAddress) {
        throw new InvalidRequestError('User address is missing in the request payload')
      }

      if (!EthAddress.validate(userAddress)) {
        throw new InvalidRequestError('Invalid user address in the request payload')
      }

      const status = await friends.getFriendshipStatus(loggedUserAddress, userAddress)

      return {
        response: {
          $case: 'accepted',
          accepted: {
            status
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error getting friendship status: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: error.message
          }
        }
      }
    }
  }
}

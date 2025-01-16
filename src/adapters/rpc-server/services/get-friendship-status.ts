import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendshipStatus,
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'

export function getFriendshipStatusService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  const mapStatus = (action: Action | undefined): FriendshipStatus => {
    return {}[action] || FriendshipStatus.UNRECOGNIZED
  }

  return async function (
    request: GetFriendshipStatusPayload,
    context: RpcServerContext
  ): Promise<GetFriendshipStatusResponse> {
    try {
      const lastFriendshipAction = await db.getLastFriendshipActionByUsers([context.address, request.user!.address])

      return {
        response: {
          $case: 'ok',
          ok: {
            status: lastFriendshipAction?.action === Action.ACCEPT ? 'friends' : 'not_friends'
          }
        }
      }
    } catch (error) {
      logger.error(error as any)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

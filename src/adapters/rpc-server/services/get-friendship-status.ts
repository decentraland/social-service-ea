import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendshipStatus,
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'

const FRIENDSHIP_STATUS_BY_ACTION = {
  [Action.ACCEPT]: FriendshipStatus.ACCEPTED,
  [Action.CANCEL]: FriendshipStatus.CANCELED,
  [Action.DELETE]: FriendshipStatus.DELETED,
  [Action.REJECT]: FriendshipStatus.REJECTED,
  [Action.REQUEST]: FriendshipStatus.REQUEST_SENT
  // [Action.BLOCK]: FriendshipStatus.BLOCKED,
}

export function getFriendshipStatusService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  const getStatusByAction = (action: Action): FriendshipStatus => {
    // TODO: distinguish between REQUEST_SENT and REQUEST_RECEIVED
    return FRIENDSHIP_STATUS_BY_ACTION[action] ?? FriendshipStatus.UNRECOGNIZED
  }

  return async function (
    request: GetFriendshipStatusPayload,
    context: RpcServerContext
  ): Promise<GetFriendshipStatusResponse> {
    try {
      const lastFriendshipAction = await db.getLastFriendshipActionByUsers([context.address, request.user!.address])

      if (!lastFriendshipAction) {
        return {
          response: {
            $case: 'internalServerError',
            internalServerError: {
              message: 'No friendship found'
            }
          }
        }
      }

      return {
        response: {
          $case: 'accepted',
          accepted: {
            status: getStatusByAction(lastFriendshipAction.action)
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

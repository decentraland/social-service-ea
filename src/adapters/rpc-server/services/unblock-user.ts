import { parseProfileToUserProfile } from '../../../logic/friends'
import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  UnblockUserPayload,
  UnblockUserResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function unblockUserService({
  components: { logs, db, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient'>) {
  const logger = logs.getLogger('unblock-user-service')

  return async function (request: UnblockUserPayload, context: RpcServerContext): Promise<UnblockUserResponse> {
    try {
      const { address: blockerAddress } = context
      const blockedAddress = request.user?.address

      if (!blockedAddress) {
        return {
          response: {
            $case: 'internalServerError',
            internalServerError: { message: 'User address is missing in the request payload' }
          }
        }
      }

      const profile = await catalystClient.getProfile(blockedAddress)

      if (!profile) {
        return {
          response: {
            $case: 'internalServerError',
            internalServerError: { message: 'Profile not found' }
          }
        }
      }

      await db.executeTx(async (tx) => {
        await db.unblockUser(blockerAddress, blockedAddress, tx)

        const friendship = await db.getFriendship([blockerAddress, blockedAddress], tx)
        if (!friendship) return

        await db.recordFriendshipAction(friendship.id, blockerAddress, Action.DELETE, null, tx)
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            profile: parseProfileToUserProfile(profile)
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error unblocking user: ${error.message}`, {
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

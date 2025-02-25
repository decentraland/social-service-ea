import { parseCatalystProfileToProfile } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  BlockUserPayload,
  BlockUserResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function blockUserService({
  components: { logs, db, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient'>) {
  const logger = logs.getLogger('block-user-service')

  return async function (request: BlockUserPayload, context: RpcServerContext): Promise<BlockUserResponse> {
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
            internalServerError: {
              message: 'Profile not found'
            }
          }
        }
      }

      await db.blockUser(blockerAddress, blockedAddress)

      return {
        response: {
          $case: 'ok',
          ok: {
            profile: parseCatalystProfileToProfile(profile)
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error blocking user: ${error.message}`, {
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

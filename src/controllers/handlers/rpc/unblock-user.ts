import { EthAddress } from '@dcl/schemas'
import {
  UnblockUserPayload,
  UnblockUserResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { parseProfileToBlockedUser } from '../../../logic/friends'
import { InvalidRequestError } from '../../errors/rpc.errors'
import { ProfileNotFoundError } from '../../../logic/friends/errors'

export function unblockUserService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('unblock-user-service')

  return async function (request: UnblockUserPayload, context: RpcServerContext): Promise<UnblockUserResponse> {
    try {
      const { address: blockerAddress } = context
      const blockedAddress = request.user?.address

      if (blockerAddress === blockedAddress) {
        throw new InvalidRequestError('Cannot unblock yourself')
      }

      if (!EthAddress.validate(blockedAddress)) {
        throw new InvalidRequestError('Invalid user address in the request payload')
      }

      const unblockedUserProfile = await friends.unblockUser(blockerAddress, blockedAddress)

      return {
        response: {
          $case: 'ok',
          ok: {
            profile: parseProfileToBlockedUser(unblockedUserProfile)
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error unblocking user: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ProfileNotFoundError) {
        return {
          response: {
            $case: 'profileNotFound',
            profileNotFound: {
              message: error.message
            }
          }
        }
      } else if (error instanceof InvalidRequestError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: error.message }
          }
        }
      }

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

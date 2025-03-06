import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  UnblockUserPayload,
  UnblockUserResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../pubsub'
import { parseProfileToBlockedUser } from '../../../logic/blocks'
import { EthAddress } from '@dcl/schemas'
export function unblockUserService({
  components: { logs, db, catalystClient, pubsub }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'pubsub'>) {
  const logger = logs.getLogger('unblock-user-service')

  return async function (request: UnblockUserPayload, context: RpcServerContext): Promise<UnblockUserResponse> {
    try {
      const { address: blockerAddress } = context
      const blockedAddress = request.user?.address

      if (blockerAddress === blockedAddress) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: 'Cannot unblock yourself' }
          }
        }
      }

      if (!EthAddress.validate(blockedAddress)) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: 'Invalid user address in the request payload' }
          }
        }
      }

      const profile = await catalystClient.getProfile(blockedAddress)

      if (!profile) {
        return {
          response: {
            $case: 'profileNotFound',
            profileNotFound: { message: `Profile not found for address ${blockedAddress}` }
          }
        }
      }

      const actionId = await db.executeTx(async (tx) => {
        await db.unblockUser(blockerAddress, blockedAddress, tx)

        const friendship = await db.getFriendship([blockerAddress, blockedAddress], tx)
        if (!friendship) return

        const actionId = await db.recordFriendshipAction(friendship.id, blockerAddress, Action.DELETE, null, tx)
        return actionId
      })

      if (actionId) {
        await pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
          id: actionId,
          from: blockerAddress,
          to: blockedAddress,
          action: Action.DELETE,
          timestamp: Date.now()
        })
      }

      await pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
        blockerAddress,
        blockedAddress,
        isBlocked: false
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            profile: parseProfileToBlockedUser(profile)
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

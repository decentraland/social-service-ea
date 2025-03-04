import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  BlockUserPayload,
  BlockUserResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { BLOCK_UPDATES_CHANNEL } from '../../pubsub'
import { parseProfileToBlockedUser } from '../../../logic/blocks'

export function blockUserService({
  components: { logs, db, catalystClient, pubsub }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'pubsub'>) {
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

      const blockedAt = await db.executeTx(async (tx) => {
        const { blocked_at } = await db.blockUser(blockerAddress, blockedAddress, tx)

        const friendship = await db.getFriendship([blockerAddress, blockedAddress], tx)
        if (!friendship) return blocked_at

        await Promise.all([
          db.updateFriendshipStatus(friendship.id, false, tx),
          db.recordFriendshipAction(friendship.id, blockerAddress, Action.BLOCK, null, tx)
        ])

        return blocked_at
      })

      await pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
        address: blockedAddress,
        isBlocked: true
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            profile: parseProfileToBlockedUser(profile, blockedAt)
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

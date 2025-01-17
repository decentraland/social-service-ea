import { Action, FriendshipStatus, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'
import {
  parseUpsertFriendshipRequest,
  validateNewFriendshipAction,
  getNewFriendshipStatus
} from '../../../logic/friendships'

export function upsertFriendshipService({
  components: { logs, db, pubsub }
}: RPCServiceContext<'logs' | 'db' | 'pubsub'>) {
  const logger = logs.getLogger('upsert-friendship-service')

  return async function (
    request: UpsertFriendshipPayload,
    context: RpcServerContext
  ): Promise<UpsertFriendshipResponse> {
    const parsedRequest = parseUpsertFriendshipRequest(request)
    if (!parsedRequest) {
      logger.error('upsert friendship received unknown message: ', request as any)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }

    logger.debug(`upsert friendship > `, parsedRequest as Record<string, string>)

    try {
      const friendship = await db.getFriendship([context.address, parsedRequest.user!])
      let lastAction = undefined
      if (friendship) {
        const lastRecordedAction = await db.getLastFriendshipAction(friendship.id)
        lastAction = lastRecordedAction
      }

      if (
        !validateNewFriendshipAction(
          context.address,
          { action: parsedRequest.action, user: parsedRequest.user },
          lastAction
        )
      ) {
        logger.error('invalid action for a friendship')
        return {
          response: {
            $case: 'invalidFriendshipAction',
            invalidFriendshipAction: {}
          }
        }
      }

      const friendshipStatus = getNewFriendshipStatus(parsedRequest.action)
      const isActive = friendshipStatus === FriendshipStatus.Friends

      logger.debug('friendship status > ', { isActive: JSON.stringify(isActive), friendshipStatus })

      const { id, createdAt } = await db.executeTx(async (tx) => {
        let id: string, createdAt: number

        if (friendship) {
          await db.updateFriendshipStatus(friendship.id, isActive, tx)
          id = friendship.id
          createdAt = new Date(friendship.created_at).getTime()
        } else {
          const { id: newFriendshipId, created_at } = await db.createFriendship(
            [context.address, parsedRequest.user!],
            isActive,
            tx
          )
          id = newFriendshipId
          createdAt = new Date(created_at).getTime()
        }

        await db.recordFriendshipAction(
          id,
          context.address,
          parsedRequest.action,
          parsedRequest.action === Action.REQUEST ? parsedRequest.metadata : null,
          tx
        )

        return { id, createdAt }
      })

      logger.debug(`${id} friendship was upsert successfully`)

      await pubsub.publishFriendshipUpdate({
        from: context.address,
        to: parsedRequest.user,
        action: parsedRequest.action,
        timestamp: Date.now(),
        metadata:
          parsedRequest.action === Action.REQUEST
            ? parsedRequest.metadata
              ? parsedRequest.metadata
              : undefined
            : undefined
      })

      return {
        response: {
          $case: 'accepted',
          accepted: {
            id: id,
            createdAt
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

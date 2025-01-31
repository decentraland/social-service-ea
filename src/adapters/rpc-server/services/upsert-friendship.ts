import { Action, FriendshipStatus, RpcServerContext, RPCServiceContext } from '../../../types'
import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  parseUpsertFriendshipRequest,
  validateNewFriendshipAction,
  getNewFriendshipStatus,
  parseFriendshipRequestToFriendshipRequestResponse
} from '../../../logic/friendships'
import { FRIENDSHIP_UPDATES_CHANNEL } from '../../pubsub'
import { sendNotification, shouldNotify } from '../../../logic/notifications'

export async function upsertFriendshipService({
  components: { logs, db, pubsub, config, catalystClient, sns }
}: RPCServiceContext<'logs' | 'db' | 'pubsub' | 'config' | 'catalystClient' | 'sns'>) {
  const logger = logs.getLogger('upsert-friendship-service')
  const profileImagesUrl = await config.requireString('PROFILE_IMAGES_URL')

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
      const lastAction = await db.getLastFriendshipActionByUsers(context.address, parsedRequest.user!)

      if (!validateNewFriendshipAction(context.address, parsedRequest, lastAction)) {
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

      const metadata =
        parsedRequest.action === Action.REQUEST && parsedRequest.metadata ? parsedRequest.metadata : undefined

      const { id, actionId, createdAt } = await db.executeTx(async (tx) => {
        let id: string, createdAt: Date

        if (lastAction) {
          const { created_at } = await db.updateFriendshipStatus(lastAction.friendship_id, isActive, tx)
          id = lastAction.friendship_id
          createdAt = created_at
        } else {
          const { id: newFriendshipId, created_at } = await db.createFriendship(
            [context.address, parsedRequest.user!],
            isActive,
            tx
          )
          id = newFriendshipId
          createdAt = created_at
        }

        const actionId = await db.recordFriendshipAction(
          id,
          context.address,
          parsedRequest.action,
          parsedRequest.action === Action.REQUEST ? parsedRequest.metadata : null,
          tx
        )

        return { id, actionId, createdAt }
      })

      logger.debug(`${id} friendship was upsert successfully`)

      const [_, profile] = await Promise.all([
        await pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
          id: actionId,
          from: context.address,
          to: parsedRequest.user,
          action: parsedRequest.action,
          timestamp: Date.now(),
          metadata
        }),
        catalystClient.getEntityByPointer(parsedRequest.user)
      ])

      const friendshipRequest = {
        id,
        timestamp: createdAt.toString(),
        metadata: metadata || null
      }

      if (shouldNotify(parsedRequest.action)) {
        await sendNotification(
          parsedRequest.action,
          {
            senderAddress: context.address,
            receiverAddress: parsedRequest.user!,
            profile,
            profileImagesUrl,
            message: metadata?.message
          },
          { sns, logs }
        )
      }

      return {
        response: {
          $case: 'accepted',
          accepted: parseFriendshipRequestToFriendshipRequestResponse(friendshipRequest, profile, profileImagesUrl)
        }
      }
    } catch (error: any) {
      logger.error(`Error upserting friendship: ${error.message}`)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

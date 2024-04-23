import { Transport, createRpcServer } from '@dcl/rpc'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service_v2/social_service.gen'
import { registerService } from '@dcl/rpc/dist/codegen'
import mitt from 'mitt'
import { IBaseComponent } from '@well-known-components/interfaces'
import {
  Action,
  AppComponents,
  Friendship,
  FriendshipStatus,
  RpcServerContext,
  SubscriptionEventsEmitter
} from '../types'
import {
  getNewFriendshipStatus,
  parseEmittedUpdateToFriendshipUpdate,
  parseUpsertFriendshipRequest,
  validateNewFriendshipAction
} from '../logic/friendships'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'
import { normalizeAddress } from '../utils/address'

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
}

const FRIENDSHIPS_COUNT_PAGE_STREAM = 20

const INTERNAL_SERVER_ERROR = 'SERVER ERROR'

export default async function createRpcServerComponent(
  components: Pick<AppComponents, 'logs' | 'db' | 'pubsub'>
): Promise<IRPCServerComponent> {
  const { logs, db, pubsub } = components

  const SHARED_CONTEXT: Pick<RpcServerContext, 'subscribers'> = {
    subscribers: {}
  }

  const server = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpcserver')
  })

  const logger = logs.getLogger('rpcserver-handler')

  server.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => ({
      getFriends(_request, context) {
        logger.debug('getting friends for ', { address: context.address })
        let friendsGenerator: AsyncGenerator<Friendship> | undefined
        try {
          friendsGenerator = db.getFriends(context.address)
        } catch (error) {
          logger.error(error as any)
          // throw an error bc there is no sense to create a generator to send an error
          // as it's done in the previous Social Service
          throw new Error(INTERNAL_SERVER_ERROR)
        }

        const generator = async function* () {
          let users = []
          for await (const friendship of friendsGenerator) {
            const { address_requested, address_requester } = friendship
            if (context.address === address_requested) {
              users.push({ address: address_requester })
            } else {
              users.push({ address: address_requested })
            }

            if (users.length === FRIENDSHIPS_COUNT_PAGE_STREAM) {
              const response = {
                users: [...users]
              }
              users = []
              yield response
            }
          }

          if (users.length) {
            const response = {
              users
            }
            yield response
          }
        }

        return generator()
      },
      getMutualFriends(request, context) {
        logger.debug(`getting mutual friends ${context.address}<>${request.user!.address}`)
        let mutualFriends: AsyncGenerator<{ address: string }> | undefined
        try {
          mutualFriends = db.getMutualFriends(context.address, normalizeAddress(request.user!.address))
        } catch (error) {
          logger.error(error as any)
          // throw an error bc there is no sense to create a generator to send an error
          // as it's done in the previous Social Service
          throw new Error(INTERNAL_SERVER_ERROR)
        }

        const generator = async function* () {
          const users = []
          for await (const friendship of mutualFriends) {
            const { address } = friendship
            users.push({ address })
            if (users.length === FRIENDSHIPS_COUNT_PAGE_STREAM) {
              const response = {
                users
              }
              yield response
            }
          }

          if (users.length) {
            const response = {
              users
            }
            yield response
          }
        }

        return generator()
      },
      async getPendingFriendshipRequests(_request, context) {
        try {
          const pendingRequests = await db.getReceivedFriendshipRequests(context.address)
          const mappedRequestss = pendingRequests.map(({ address, timestamp, metadata }) => ({
            user: { address },
            createdAt: new Date(timestamp).getTime(),
            message: metadata?.message || ''
          }))

          return {
            response: {
              $case: 'requests',
              requests: {
                requests: mappedRequestss
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
      },
      async getSentFriendshipRequests(_request, context) {
        try {
          const pendingRequests = await db.getSentFriendshipRequests(context.address)
          const mappedRequestss = pendingRequests.map(({ address, timestamp, metadata }) => ({
            user: { address },
            createdAt: new Date(timestamp).getTime(),
            message: metadata?.message || ''
          }))

          return {
            response: {
              $case: 'requests',
              requests: {
                requests: mappedRequestss
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
      },
      async upsertFriendship(request, context) {
        const parsedRequest = parseUpsertFriendshipRequest(request)
        if (!parsedRequest) {
          logger.error('upsert friendship received unkwown message: ', request as any)
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

          logger.debug('friendshipstatus > ', { isActive: JSON.stringify(isActive), friendshipStatus })

          const id = await db.executeTx(async (tx) => {
            let id
            if (friendship) {
              await db.updateFriendshipStatus(friendship.id, isActive, tx)
              id = friendship.id
            } else {
              const newFriendshipId = await db.createFriendship([context.address, parsedRequest.user!], isActive, tx)
              id = newFriendshipId
            }

            await db.recordFriendshipAction(
              id,
              context.address,
              parsedRequest.action,
              parsedRequest.action === Action.REQUEST ? parsedRequest.metadata : null,
              tx
            )
            return id
          })

          logger.debug(`${id} friendship was upserted successfully`)

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
              accepted: {}
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
      },
      subscribeToFriendshipUpdates(_request, context) {
        const eventEmitter = mitt<SubscriptionEventsEmitter>()
        context.subscribers[context.address] = eventEmitter
        const updatesGenerator = emitterToAsyncGenerator(eventEmitter, 'update')

        const generator = async function* () {
          for await (const update of updatesGenerator) {
            logger.debug('> friendship update received, sending: ', { update: update as any })
            const updateToResponse = parseEmittedUpdateToFriendshipUpdate(update)
            if (updateToResponse) {
              yield updateToResponse
            } else {
              logger.error('> unable to parse update to FriendshipUpdate > ', { update: update as any })
            }
          }
        }

        return generator()
      }
    }))
  })

  return {
    async start() {
      await pubsub.subscribeToFriendshipUpdates((message) => {
        try {
          const update = JSON.parse(message) as SubscriptionEventsEmitter['update']
          const updateEmitter = SHARED_CONTEXT.subscribers[update.to]
          if (updateEmitter) {
            updateEmitter.emit('update', update)
          }
        } catch (error) {
          logger.error(error as any)
        }
      })
    },
    attachUser({ transport, address }) {
      transport.on('close', () => {
        if (SHARED_CONTEXT.subscribers[address]) {
          delete SHARED_CONTEXT.subscribers[address]
        }
      })
      server.attachTransport(transport, { subscribers: SHARED_CONTEXT.subscribers, address })
    }
  }
}

import { createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import { AppComponents, IRPCServerComponent, RpcServerContext, SubscriptionEventsEmitter } from '../../types'
import { getFriendsService } from './services/get-friends'
import { getMutualFriendsService } from './services/get-mutual-friends'
import { getPendingFriendshipRequestsService } from './services/get-pending-friendship-requests'
import { upsertFriendshipService } from './services/upsert-friendship'
import { subscribeToFriendshipUpdatesService } from './services/subscribe-to-friendship-updates'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getSentFriendshipRequestsService } from './services/get-sent-friendship-requests'
import { getFriendshipStatusService } from './services/get-friendship-status'
import { subscribeToFriendUpdatesService } from './services/subscribe-to-friend-updates'
import { FRIEND_STATUS_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../pubsub'

export async function createRpcServerComponent({
  logs,
  db,
  pubsub,
  config,
  server,
  archipelagoStats,
  catalystClient
}: Pick<
  AppComponents,
  'logs' | 'db' | 'pubsub' | 'config' | 'server' | 'nats' | 'archipelagoStats' | 'redis' | 'catalystClient'
>): Promise<IRPCServerComponent> {
  // TODO: this should be a redis if we want to have more than one instance of the server
  const SHARED_CONTEXT: Pick<RpcServerContext, 'subscribers'> = {
    subscribers: {}
  }

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const logger = logs.getLogger('rpc-server-handler')

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = await getFriendsService({ components: { logs, db, catalystClient, config } })
  const getMutualFriends = getMutualFriendsService({ components: { logs, db } })
  const getPendingFriendshipRequests = getPendingFriendshipRequestsService({ components: { logs, db } })
  const getSentFriendshipRequests = getSentFriendshipRequestsService({ components: { logs, db } })
  const upsertFriendship = upsertFriendshipService({ components: { logs, db, pubsub } })
  const getFriendshipStatus = getFriendshipStatusService({ components: { logs, db } })
  const subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({ components: { logs } })
  const subscribeToFriendUpdates = subscribeToFriendUpdatesService({
    components: { logs, db, archipelagoStats }
  })

  function handleFriendshipUpdate(message: string) {
    try {
      const update = JSON.parse(message) as SubscriptionEventsEmitter['friendshipUpdate']
      const updateEmitter = SHARED_CONTEXT.subscribers[update.to]
      if (updateEmitter) {
        updateEmitter.emit('friendshipUpdate', update)
      }
    } catch (error: any) {
      logger.error(`Error handling friendship update: ${error.message}`, {
        message
      })
    }
  }

  async function handleFriendStatusUpdate(message: string) {
    try {
      // TODO: this may be a problem if the user has a lot of friends or there are a lot of users online
      const update = JSON.parse(message) as SubscriptionEventsEmitter['friendStatusUpdate']
      const friends = await db.getOnlineFriends(update.address, Object.keys(SHARED_CONTEXT.subscribers))

      friends.forEach(({ address: friendAddress }) => {
        const emitter = SHARED_CONTEXT.subscribers[friendAddress]
        if (emitter) {
          emitter.emit('friendStatusUpdate', update)
        }
      })
    } catch (error: any) {
      logger.error(`Error handling friend status update: ${error.message}`, {
        message
      })
    }
  }

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => ({
      getFriends,
      getMutualFriends,
      getPendingFriendshipRequests,
      getSentFriendshipRequests,
      getFriendshipStatus,
      upsertFriendship,
      subscribeToFriendshipUpdates,
      subscribeToFriendUpdates
    }))
  })

  return {
    async start() {
      server.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, handleFriendshipUpdate)
      await pubsub.subscribeToChannel(FRIEND_STATUS_UPDATES_CHANNEL, handleFriendStatusUpdate)
    },
    attachUser({ transport, address }) {
      transport.on('close', () => {
        if (SHARED_CONTEXT.subscribers[address]) {
          delete SHARED_CONTEXT.subscribers[address]
        }
      })
      rpcServer.attachTransport(transport, { subscribers: SHARED_CONTEXT.subscribers, address })
    }
  }
}

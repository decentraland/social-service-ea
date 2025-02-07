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
import { subscribeToFriendConnectivityUpdatesService } from './services/subscribe-to-friend-connectivity-updates'
import { FRIEND_STATUS_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../pubsub'
import { friendshipUpdateHandler, friendConnectivityUpdateHandler } from '../../logic/updates'
import mitt from 'mitt'
import { normalizeAddress } from '../../utils/address'

export async function createRpcServerComponent({
  logs,
  db,
  pubsub,
  config,
  server,
  archipelagoStats,
  catalystClient,
  sns
}: Pick<
  AppComponents,
  'logs' | 'db' | 'pubsub' | 'config' | 'server' | 'archipelagoStats' | 'catalystClient' | 'sns'
>): Promise<IRPCServerComponent> {
  const SHARED_CONTEXT: Pick<RpcServerContext, 'subscribers'> = {
    subscribers: {}
  }

  const getContext = () => SHARED_CONTEXT
  const logger = logs.getLogger('rpc-server-handler')

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = await getFriendsService({ components: { logs, db, catalystClient, config } })
  const getMutualFriends = await getMutualFriendsService({ components: { logs, db, catalystClient, config } })
  const getPendingFriendshipRequests = await getPendingFriendshipRequestsService({
    components: { logs, db, catalystClient, config }
  })
  const getSentFriendshipRequests = await getSentFriendshipRequestsService({
    components: { logs, db, catalystClient, config }
  })
  const upsertFriendship = await upsertFriendshipService({
    components: { logs, db, pubsub, config, catalystClient, sns }
  })
  const getFriendshipStatus = getFriendshipStatusService({ components: { logs, db } })
  const subscribeToFriendshipUpdates = await subscribeToFriendshipUpdatesService({
    components: { logs, config, catalystClient }
  })
  const subscribeToFriendConnectivityUpdates = await subscribeToFriendConnectivityUpdatesService({
    components: { logs, db, archipelagoStats, config, catalystClient }
  })

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => ({
      getFriends,
      getMutualFriends,
      getPendingFriendshipRequests,
      getSentFriendshipRequests,
      getFriendshipStatus,
      upsertFriendship,
      subscribeToFriendshipUpdates,
      subscribeToFriendConnectivityUpdates
    }))
  })

  return {
    async start() {
      server.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, friendshipUpdateHandler(getContext, logger))
      await pubsub.subscribeToChannel(
        FRIEND_STATUS_UPDATES_CHANNEL,
        friendConnectivityUpdateHandler(getContext, logger, db)
      )
    },
    attachUser({ transport, address }) {
      const normalizedAddress = normalizeAddress(address)

      transport.on('close', () => {
        if (SHARED_CONTEXT.subscribers[normalizedAddress]) {
          delete SHARED_CONTEXT.subscribers[normalizedAddress]
          logger.debug('User disconnected and removed from subscribers', { address: normalizedAddress })
        }
      })

      const eventEmitter = SHARED_CONTEXT.subscribers[normalizedAddress] || mitt<SubscriptionEventsEmitter>()

      if (!SHARED_CONTEXT.subscribers[normalizedAddress]) {
        SHARED_CONTEXT.subscribers[normalizedAddress] = eventEmitter
      }

      rpcServer.attachTransport(transport, { subscribers: SHARED_CONTEXT.subscribers, address: normalizedAddress })
    },
    detachUser(address) {
      const normalizedAddress = normalizeAddress(address)

      if (SHARED_CONTEXT.subscribers[normalizedAddress]) {
        SHARED_CONTEXT.subscribers[normalizedAddress].all.clear()
        delete SHARED_CONTEXT.subscribers[normalizedAddress]
        logger.debug('Detached user and cleaned up subscribers', { address: normalizedAddress })
      }
    }
  }
}

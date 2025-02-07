import { createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import { AppComponents, IRPCServerComponent, RpcServerContext } from '../../types'
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
import { normalizeAddress } from '../../utils/address'

export async function createRpcServerComponent({
  logs,
  db,
  pubsub,
  config,
  server,
  archipelagoStats,
  catalystClient,
  sns,
  subscribersContext
}: Pick<
  AppComponents,
  'logs' | 'db' | 'pubsub' | 'config' | 'server' | 'archipelagoStats' | 'catalystClient' | 'sns' | 'subscribersContext'
>): Promise<IRPCServerComponent> {
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

      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, friendshipUpdateHandler(subscribersContext, logger))
      await pubsub.subscribeToChannel(
        FRIEND_STATUS_UPDATES_CHANNEL,
        friendConnectivityUpdateHandler(subscribersContext, logger, db)
      )
    },
    attachUser({ transport, address }) {
      const normalizedAddress = normalizeAddress(address)

      transport.on('close', () => {
        subscribersContext.removeSubscriber(normalizedAddress)
        logger.debug('User disconnected and removed from subscribers', { address: normalizedAddress })
      })

      const eventEmitter = subscribersContext.getSubscriber(normalizedAddress)
      subscribersContext.addSubscriber(normalizedAddress, eventEmitter)
      rpcServer.attachTransport(transport, {
        subscribersContext,
        address: normalizedAddress
      })
    },
    detachUser(address) {
      const normalizedAddress = normalizeAddress(address)
      subscribersContext.removeSubscriber(normalizedAddress)
      logger.debug('Detached user and cleaned up subscribers', { address: normalizedAddress })
    }
  }
}

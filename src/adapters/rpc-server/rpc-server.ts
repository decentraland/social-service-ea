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
import {
  friendshipUpdateHandler,
  friendConnectivityUpdateHandler,
  friendshipAcceptedUpdateHandler
} from '../../logic/updates'
import { getPrivateMessagesSettingsService } from './services/get-private-messages-settings'
import { upsertSocialSettingsService } from './services/upsert-social-settings'
import { getSocialSettingsService } from './services/get-social-settings'

export async function createRpcServerComponent({
  logs,
  db,
  pubsub,
  config,
  server,
  archipelagoStats,
  catalystClient,
  sns,
  subscribersContext,
  worldsStats
}: Pick<
  AppComponents,
  | 'logs'
  | 'db'
  | 'pubsub'
  | 'config'
  | 'server'
  | 'archipelagoStats'
  | 'catalystClient'
  | 'sns'
  | 'subscribersContext'
  | 'worldsStats'
>): Promise<IRPCServerComponent> {
  const logger = logs.getLogger('rpc-server-handler')

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = getFriendsService({ components: { logs, db, catalystClient } })
  const getMutualFriends = getMutualFriendsService({ components: { logs, db, catalystClient } })
  const getPendingFriendshipRequests = getPendingFriendshipRequestsService({
    components: { logs, db, catalystClient }
  })
  const getSentFriendshipRequests = getSentFriendshipRequestsService({
    components: { logs, db, catalystClient }
  })
  const upsertFriendship = upsertFriendshipService({
    components: { logs, db, pubsub, catalystClient, sns }
  })
  const getFriendshipStatus = getFriendshipStatusService({ components: { logs, db } })
  const subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({
    components: { logs, catalystClient }
  })
  const subscribeToFriendConnectivityUpdates = subscribeToFriendConnectivityUpdatesService({
    components: { logs, db, archipelagoStats, catalystClient, worldsStats }
  })
  const getPrivateMessagesSettings = getPrivateMessagesSettingsService({ components: { logs, db } })
  const upsertSocialSettings = upsertSocialSettingsService({ components: { logs, db } })
  const getSocialSettings = getSocialSettingsService({ components: { logs, db } })

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => ({
      getFriends,
      getMutualFriends,
      getPendingFriendshipRequests,
      getSentFriendshipRequests,
      getFriendshipStatus,
      upsertFriendship,
      subscribeToFriendshipUpdates,
      subscribeToFriendConnectivityUpdates,
      getPrivateMessagesSettings,
      upsertSocialSettings,
      getSocialSettings
    }))
  })

  return {
    async start() {
      server.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, friendshipUpdateHandler(subscribersContext, logger))
      await pubsub.subscribeToChannel(
        FRIENDSHIP_UPDATES_CHANNEL,
        friendshipAcceptedUpdateHandler(subscribersContext, logger)
      )
      await pubsub.subscribeToChannel(
        FRIEND_STATUS_UPDATES_CHANNEL,
        friendConnectivityUpdateHandler(subscribersContext, logger, db)
      )
    },
    attachUser({ transport, address }) {
      logger.debug('[DEBUGGING CONNECTION] Attaching user to RPC', {
        address,
        transportConnected: String(transport.isConnected)
      })

      transport.on('close', () => {
        logger.debug('[DEBUGGING CONNECTION] Transport closed, removing subscriber', {
          address
        })
        subscribersContext.removeSubscriber(address)
      })

      const eventEmitter = subscribersContext.getOrAddSubscriber(address)
      subscribersContext.addSubscriber(address, eventEmitter)
      rpcServer.attachTransport(transport, {
        subscribersContext,
        address
      })
    },
    detachUser(address) {
      logger.debug('[DEBUGGING CONNECTION] Detaching user from RPC', {
        address
      })
      subscribersContext.removeSubscriber(address)
    }
  }
}

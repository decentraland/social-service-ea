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
import { BLOCK_UPDATES_CHANNEL, FRIEND_STATUS_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../pubsub'
import {
  friendshipUpdateHandler,
  friendConnectivityUpdateHandler,
  friendshipAcceptedUpdateHandler,
  blockUpdateHandler
} from '../../logic/updates'
import { getPrivateMessagesSettingsService } from './services/get-private-messages-settings'
import { upsertSocialSettingsService } from './services/upsert-social-settings'
import { getSocialSettingsService } from './services/get-social-settings'
import { blockUserService } from './services/block-user'
import { getBlockedUsersService } from './services/get-blocked-users'
import { unblockUserService } from './services/unblock-user'
import { getBlockingStatusService } from './services/get-blocking-status'
import { subscribeToBlockUpdatesService } from './services/subscribe-to-block-updates'
import { createRpcServerMetrics } from './metrics'

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
  worldsStats,
  metrics
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
  | 'metrics'
>): Promise<IRPCServerComponent> {
  const logger = logs.getLogger('rpc-server-handler')

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const { measureRpcCall: withPromiseMetrics, measureRpcStream: withStreamMetrics } = createRpcServerMetrics({
    components: { metrics, logs }
  })

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = withPromiseMetrics('getFriends', getFriendsService({ components: { logs, db, catalystClient } }))
  const getMutualFriends = withPromiseMetrics(
    'getMutualFriends',
    getMutualFriendsService({ components: { logs, db, catalystClient } })
  )
  const getPendingFriendshipRequests = withPromiseMetrics(
    'getPendingFriendshipRequests',
    getPendingFriendshipRequestsService({
      components: { logs, db, catalystClient }
    })
  )
  const getSentFriendshipRequests = withPromiseMetrics(
    'getSentFriendshipRequests',
    getSentFriendshipRequestsService({
      components: { logs, db, catalystClient }
    })
  )
  const upsertFriendship = withPromiseMetrics(
    'upsertFriendship',
    upsertFriendshipService({
      components: { logs, db, pubsub, catalystClient, sns }
    })
  )
  const getFriendshipStatus = withPromiseMetrics(
    'getFriendshipStatus',
    getFriendshipStatusService({ components: { logs, db } })
  )
  const subscribeToFriendshipUpdates = withStreamMetrics(
    'subscribeToFriendshipUpdates',
    subscribeToFriendshipUpdatesService({
      components: { logs, catalystClient }
    })
  )
  const subscribeToFriendConnectivityUpdates = withStreamMetrics(
    'subscribeToFriendConnectivityUpdates',
    subscribeToFriendConnectivityUpdatesService({
      components: { logs, db, archipelagoStats, catalystClient, worldsStats }
    })
  )
  const subscribeToBlockUpdates = withStreamMetrics(
    'subscribeToBlockUpdates',
    subscribeToBlockUpdatesService({
      components: { logs, catalystClient }
    })
  )

  const blockUser = withPromiseMetrics(
    'blockUser',
    blockUserService({ components: { logs, db, catalystClient, pubsub } })
  )
  const unblockUser = withPromiseMetrics(
    'unblockUser',
    unblockUserService({ components: { logs, db, catalystClient, pubsub } })
  )
  const getBlockedUsers = withPromiseMetrics(
    'getBlockedUsers',
    getBlockedUsersService({ components: { logs, db, catalystClient } })
  )
  const getBlockingStatus = withPromiseMetrics(
    'getBlockingStatus',
    getBlockingStatusService({ components: { logs, db } })
  )

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
      blockUser,
      unblockUser,
      getBlockedUsers,
      getBlockingStatus,
      subscribeToFriendshipUpdates,
      subscribeToFriendConnectivityUpdates,
      getPrivateMessagesSettings,
      upsertSocialSettings,
      getSocialSettings,
      subscribeToBlockUpdates
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
      await pubsub.subscribeToChannel(BLOCK_UPDATES_CHANNEL, blockUpdateHandler(subscribersContext, logger))
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

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
import {
  BLOCK_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL,
  FRIENDSHIP_UPDATES_CHANNEL,
  PRIVATE_VOICE_CHAT_UPDATES_CHANNEL
} from '../pubsub'
import {
  friendshipUpdateHandler,
  friendConnectivityUpdateHandler,
  friendshipAcceptedUpdateHandler,
  blockUpdateHandler,
  privateVoiceChatUpdateHandler
} from '../../logic/updates'
import { getPrivateMessagesSettingsService } from './services/get-private-messages-settings'
import { upsertSocialSettingsService } from './services/upsert-social-settings'
import { getSocialSettingsService } from './services/get-social-settings'
import { blockUserService } from './services/block-user'
import { getBlockedUsersService } from './services/get-blocked-users'
import { unblockUserService } from './services/unblock-user'
import { getBlockingStatusService } from './services/get-blocking-status'
import { subscribeToBlockUpdatesService } from './services/subscribe-to-block-updates'
import { createRpcServerMetricsWrapper, ServiceType } from './metrics-wrapper'
import { startPrivateVoiceChatService } from './services/start-private-voice-chat'
import { acceptPrivateVoiceChatService } from './services/accept-private-voice-chat'
import { rejectPrivateVoiceChatService } from './services/reject-private-voice-chat'
import { endPrivateVoiceChatService } from './services/end-private-voice-chat'
import { getIncomingPrivateVoiceChatRequestsService } from './services/get-incoming-private-voice-chat-requests'
import { subscribeToPrivateVoiceChatUpdatesService } from './services/subscribe-to-private-voice-chat-updates'

export async function createRpcServerComponent({
  logs,
  friendsDb,
  pubsub,
  config,
  uwsServer,
  catalystClient,
  sns,
  subscribersContext,
  commsGatekeeper,
  metrics,
  settings,
  voice,
  peersStats
}: Pick<
  AppComponents,
  | 'logs'
  | 'friendsDb'
  | 'pubsub'
  | 'config'
  | 'uwsServer'
  | 'catalystClient'
  | 'sns'
  | 'subscribersContext'
  | 'commsGatekeeper'
  | 'metrics'
  | 'settings'
  | 'voice'
  | 'peersStats'
>): Promise<IRPCServerComponent> {
  const logger = logs.getLogger('rpc-server-handler')

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const { withMetrics } = createRpcServerMetricsWrapper({
    components: { metrics, logs }
  })

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const serviceCreators = {
    getFriends: {
      creator: getFriendsService({ components: { logs, friendsDb: friendsDb, catalystClient } }),
      type: ServiceType.CALL
    },
    getMutualFriends: {
      creator: getMutualFriendsService({ components: { logs, friendsDb: friendsDb, catalystClient } }),
      type: ServiceType.CALL
    },
    getPendingFriendshipRequests: {
      creator: getPendingFriendshipRequestsService({ components: { logs, friendsDb: friendsDb, catalystClient } }),
      type: ServiceType.CALL
    },
    getSentFriendshipRequests: {
      creator: getSentFriendshipRequestsService({ components: { logs, friendsDb: friendsDb, catalystClient } }),
      type: ServiceType.CALL
    },
    upsertFriendship: {
      creator: upsertFriendshipService({ components: { logs, friendsDb: friendsDb, pubsub, catalystClient, sns } }),
      type: ServiceType.CALL
    },
    getFriendshipStatus: {
      creator: getFriendshipStatusService({ components: { logs, friendsDb: friendsDb } }),
      type: ServiceType.CALL
    },
    subscribeToFriendshipUpdates: {
      creator: subscribeToFriendshipUpdatesService({ components: { logs, catalystClient } }),
      type: ServiceType.STREAM,
      event: 'friendship_updates'
    },
    subscribeToFriendConnectivityUpdates: {
      creator: subscribeToFriendConnectivityUpdatesService({
        components: { logs, friendsDb: friendsDb, catalystClient, peersStats }
      }),
      type: ServiceType.STREAM,
      event: 'friend_connectivity_updates'
    },
    subscribeToBlockUpdates: {
      creator: subscribeToBlockUpdatesService({ components: { logs, catalystClient } }),
      type: ServiceType.STREAM,
      event: 'block_updates'
    },
    subscribeToPrivateVoiceChatUpdates: {
      creator: subscribeToPrivateVoiceChatUpdatesService({ components: { logs, voice, catalystClient } }),
      type: ServiceType.STREAM,
      event: 'private_voice_chat_updates'
    },
    blockUser: {
      creator: blockUserService({ components: { logs, friendsDb: friendsDb, catalystClient, pubsub } }),
      type: ServiceType.CALL
    },
    unblockUser: {
      creator: unblockUserService({ components: { logs, friendsDb: friendsDb, catalystClient, pubsub } }),
      type: ServiceType.CALL
    },
    getBlockedUsers: {
      creator: getBlockedUsersService({ components: { logs, friendsDb: friendsDb, catalystClient } }),
      type: ServiceType.CALL
    },
    getBlockingStatus: {
      creator: getBlockingStatusService({ components: { logs, friendsDb: friendsDb } }),
      type: ServiceType.CALL
    },
    getPrivateMessagesSettings: {
      creator: getPrivateMessagesSettingsService({ components: { logs, friendsDb: friendsDb } }),
      type: ServiceType.CALL
    },
    upsertSocialSettings: {
      creator: upsertSocialSettingsService({ components: { logs, friendsDb: friendsDb, commsGatekeeper } }),
      type: ServiceType.CALL
    },
    getSocialSettings: {
      creator: getSocialSettingsService({ components: { logs, settings } }),
      type: ServiceType.CALL
    },
    startPrivateVoiceChat: {
      creator: startPrivateVoiceChatService({ components: { logs, voice } }),
      type: ServiceType.CALL
    },
    acceptPrivateVoiceChat: {
      creator: acceptPrivateVoiceChatService({ components: { logs, voice } }),
      type: ServiceType.CALL
    },
    rejectPrivateVoiceChat: {
      creator: rejectPrivateVoiceChatService({ components: { logs, voice } }),
      type: ServiceType.CALL
    },
    endPrivateVoiceChat: {
      creator: endPrivateVoiceChatService({ components: { logs, voice } }),
      type: ServiceType.CALL
    },
    getIncomingPrivateVoiceChatRequest: {
      creator: getIncomingPrivateVoiceChatRequestsService({ components: { logs, voice } }),
      type: ServiceType.CALL
    }
  }

  const servicesWithMetrics = withMetrics(serviceCreators)

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => servicesWithMetrics)
  })

  return {
    async start() {
      uwsServer.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

      await pubsub.subscribeToChannel(FRIENDSHIP_UPDATES_CHANNEL, friendshipUpdateHandler(subscribersContext, logger))
      await pubsub.subscribeToChannel(
        FRIENDSHIP_UPDATES_CHANNEL,
        friendshipAcceptedUpdateHandler(subscribersContext, logger)
      )
      await pubsub.subscribeToChannel(
        FRIEND_STATUS_UPDATES_CHANNEL,
        friendConnectivityUpdateHandler(subscribersContext, logger, friendsDb)
      )
      await pubsub.subscribeToChannel(BLOCK_UPDATES_CHANNEL, blockUpdateHandler(subscribersContext, logger))
      await pubsub.subscribeToChannel(
        PRIVATE_VOICE_CHAT_UPDATES_CHANNEL,
        privateVoiceChatUpdateHandler(subscribersContext, logger)
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
      // End all calls that the user is involved in
      voice.endIncomingOrOutgoingPrivateVoiceChatForUser(address).catch((_) => {
        // Do nothing
      })
      subscribersContext.removeSubscriber(address)
    }
  }
}

import { createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import { AppComponents, IRPCServerComponent, RpcServerContext } from '../../types'
import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  BLOCK_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL,
  FRIENDSHIP_UPDATES_CHANNEL,
  PRIVATE_VOICE_CHAT_UPDATES_CHANNEL,
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL,
  COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL
} from '../pubsub'
import { createRpcServerMetricsWrapper } from './metrics-wrapper'
import { RpcServiceCreators } from '../../controllers/routes/rpc.routes'

export async function createRpcServerComponent({
  logs,
  pubsub,
  config,
  uwsServer,
  subscribersContext,
  metrics,
  voice,
  updateHandler
}: Pick<
  AppComponents,
  'logs' | 'pubsub' | 'config' | 'uwsServer' | 'subscribersContext' | 'metrics' | 'voice' | 'updateHandler'
>): Promise<IRPCServerComponent> {
  const logger = logs.getLogger('rpc-server-handler')

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpc-server')
  })

  const { withMetrics } = createRpcServerMetricsWrapper({
    components: { metrics, logs }
  })

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const subscriptionsMap = {
    [FRIENDSHIP_UPDATES_CHANNEL]: [
      updateHandler.friendshipUpdateHandler,
      updateHandler.friendshipAcceptedUpdateHandler
    ],
    [FRIEND_STATUS_UPDATES_CHANNEL]: [updateHandler.friendConnectivityUpdateHandler],
    [COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL]: [updateHandler.communityMemberConnectivityUpdateHandler],
    [COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL]: [updateHandler.communityMemberStatusHandler],
    [BLOCK_UPDATES_CHANNEL]: [updateHandler.blockUpdateHandler],
    [PRIVATE_VOICE_CHAT_UPDATES_CHANNEL]: [updateHandler.privateVoiceChatUpdateHandler]
  }

  let serviceCreators: RpcServiceCreators | null = null

  return {
    setServiceCreators(creators: RpcServiceCreators) {
      serviceCreators = creators
      const servicesWithMetrics = withMetrics(creators)

      rpcServer.setHandler(async function handler(port) {
        registerService(port, SocialServiceDefinition, async () => servicesWithMetrics as any)
      })
    },
    async start() {
      if (!serviceCreators) {
        throw new Error('Service creators must be set before starting the RPC server')
      }

      uwsServer.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

      await Promise.all(
        Object.entries(subscriptionsMap).map(([channel, handlers]) =>
          handlers.forEach((handler) => pubsub.subscribeToChannel(channel, handler))
        )
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

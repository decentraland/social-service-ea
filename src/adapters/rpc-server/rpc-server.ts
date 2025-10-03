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
  COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL,
  COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL,
  COMMUNITY_DELETED_UPDATES_CHANNEL
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
  console.log('rpcServerPort', rpcServerPort)

  const subscriptionsMap = {
    [FRIENDSHIP_UPDATES_CHANNEL]: [
      updateHandler.friendshipUpdateHandler,
      updateHandler.friendshipAcceptedUpdateHandler
    ],
    [FRIEND_STATUS_UPDATES_CHANNEL]: [updateHandler.friendConnectivityUpdateHandler],
    [COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL]: [updateHandler.communityMemberConnectivityUpdateHandler],
    [COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL]: [updateHandler.communityMemberStatusHandler],
    [COMMUNITY_DELETED_UPDATES_CHANNEL]: [updateHandler.communityDeletedUpdateHandler],
    [BLOCK_UPDATES_CHANNEL]: [updateHandler.blockUpdateHandler],
    [PRIVATE_VOICE_CHAT_UPDATES_CHANNEL]: [updateHandler.privateVoiceChatUpdateHandler],
    [COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL]: [updateHandler.communityVoiceChatUpdateHandler]
  }

  let serviceCreators: RpcServiceCreators | null = null

  return {
    setServiceCreators(creators: RpcServiceCreators) {
      serviceCreators = creators
      const servicesWithMetrics = withMetrics(creators)

      rpcServer.setHandler(async function handler(port) {
        try {
          const result = registerService(port, SocialServiceDefinition, async () => {
            return servicesWithMetrics as any
          })
          return result
        } catch (error: any) {
          throw error
        }
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
      const eventEmitter = subscribersContext.getOrAddSubscriber(address)
      subscribersContext.addSubscriber(address, eventEmitter)
      rpcServer.attachTransport(transport, {
        subscribersContext,
        address
      })
    },
    detachUser(address) {
      // Check if the user is subscribed before detaching
      if (subscribersContext.getSubscribersAddresses().find((a) => a === address)) {
        // End all calls that the user is involved in
        subscribersContext.removeSubscriber(address)
        voice.endIncomingOrOutgoingPrivateVoiceChatForUser(address).catch((_) => {
          // Do nothing
        })
      }
    }
  }
}

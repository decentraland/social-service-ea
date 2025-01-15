import { Transport, createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, RpcServerContext, SubscriptionEventsEmitter } from '../../types'
import { getFriendsService } from './services/get-friends'
import { getMutualFriendsService } from './services/get-mutual-friends'
import { getPendingFriendshipRequestsService } from './services/get-pending-friendship-requests'
import { upsertFriendshipService } from './services/upsert-friendship'
import { subscribeToFriendshipUpdatesService } from './services/subscribe-to-friendship-updates'
import { SocialServiceV2Definition } from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
}

export async function createRpcServerComponent(
  components: Pick<AppComponents, 'logs' | 'db' | 'pubsub' | 'config' | 'server'>
): Promise<IRPCServerComponent> {
  const { logs, db, pubsub, config, server } = components

  const SHARED_CONTEXT: Pick<RpcServerContext, 'subscribers'> = {
    subscribers: {}
  }

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpcServer')
  })

  const logger = logs.getLogger('rpcServer-handler')

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = getFriendsService({ components: { logs, db } })
  const getMutualFriends = getMutualFriendsService({ components: { logs, db } })
  const getPendingFriendshipRequests = getPendingFriendshipRequestsService({ components: { logs, db } })
  const getSentFriendshipRequests = getPendingFriendshipRequestsService({ components: { logs, db } })
  const upsertFriendship = upsertFriendshipService({ components: { logs, db, pubsub } })
  const subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({ components: { logs } })

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceV2Definition, async () => ({
      getFriends,
      getMutualFriends,
      getPendingFriendshipRequests,
      getSentFriendshipRequests,
      upsertFriendship,
      subscribeToFriendshipUpdates
    }))
  })

  return {
    async start() {
      server.app.listen(rpcServerPort, () => {
        logger.info(`[RPC] RPC Server listening on port ${rpcServerPort}`)
      })

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
      rpcServer.attachTransport(transport, { subscribers: SHARED_CONTEXT.subscribers, address })
    }
  }
}

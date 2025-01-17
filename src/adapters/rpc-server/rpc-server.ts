import { Transport, createRpcServer } from '@dcl/rpc'
import { registerService } from '@dcl/rpc/dist/codegen'
import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, RpcServerContext, SubscriptionEventsEmitter } from '../../types'
import { getFriendsService } from './services/get-friends'
import { getMutualFriendsService } from './services/get-mutual-friends'
import { getPendingFriendshipRequestsService } from './services/get-pending-friendship-requests'
import { upsertFriendshipService } from './services/upsert-friendship'
import { subscribeToFriendshipUpdatesService } from './services/subscribe-to-friendship-updates'
import { SocialServiceDefinition } from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'
import { getSentFriendshipRequestsService } from './services/get-sent-friendship-requests'
import { getFriendshipStatusService } from './services/get-friendship-status'

export type IRPCServerComponent = IBaseComponent & {
  attachUser(user: { transport: Transport; address: string }): void
}

export async function createRpcServerComponent({
  logs,
  db,
  pubsub,
  config,
  server,
  archipelagoStats
}: Pick<
  AppComponents,
  'logs' | 'db' | 'pubsub' | 'config' | 'server' | 'archipelagoStats'
>): Promise<IRPCServerComponent> {
  const SHARED_CONTEXT: Pick<RpcServerContext, 'subscribers'> = {
    subscribers: {}
  }

  const rpcServer = createRpcServer<RpcServerContext>({
    logger: logs.getLogger('rpcServer')
  })

  const logger = logs.getLogger('rpcServer-handler')

  const rpcServerPort = (await config.getNumber('RPC_SERVER_PORT')) || 8085

  const getFriends = getFriendsService({ components: { logs, db, archipelagoStats } })
  const getMutualFriends = getMutualFriendsService({ components: { logs, db } })
  const getPendingFriendshipRequests = getPendingFriendshipRequestsService({ components: { logs, db } })
  const getSentFriendshipRequests = getSentFriendshipRequestsService({ components: { logs, db } })
  const upsertFriendship = upsertFriendshipService({ components: { logs, db, pubsub } })
  const subscribeToFriendshipUpdates = subscribeToFriendshipUpdatesService({ components: { logs } })
  const getFriendshipStatus = getFriendshipStatusService({ components: { logs, db } })

  rpcServer.setHandler(async function handler(port) {
    registerService(port, SocialServiceDefinition, async () => ({
      getFriends,
      getMutualFriends,
      getPendingFriendshipRequests,
      getSentFriendshipRequests,
      getFriendshipStatus,
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

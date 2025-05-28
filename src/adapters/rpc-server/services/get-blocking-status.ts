import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { GetBlockingStatusResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getBlockingStatusService({ components: { logs, friendsDb } }: RPCServiceContext<'logs' | 'friendsDb'>) {
  const logger = logs.getLogger('get-blocking-status-service')

  return async function (_request: Empty, context: RpcServerContext): Promise<GetBlockingStatusResponse> {
    const { address } = context

    try {
      const [blockedUsers, blockedByUsers] = await Promise.all([
        friendsDb.getBlockedUsers(address),
        friendsDb.getBlockedByUsers(address)
      ])

      const blockedAddresses = blockedUsers.map((user) => user.address)
      const blockedByAddresses = blockedByUsers.map((user) => user.address)

      return {
        blockedUsers: blockedAddresses,
        blockedByUsers: blockedByAddresses
      }
    } catch (error: any) {
      logger.error(`Error getting blocking status: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })
      return {
        blockedUsers: [],
        blockedByUsers: []
      }
    }
  }
}

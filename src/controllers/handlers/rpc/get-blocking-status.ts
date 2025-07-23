import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { GetBlockingStatusResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getBlockingStatusService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-blocking-status-service')

  return async function (_request: Empty, context: RpcServerContext): Promise<GetBlockingStatusResponse> {
    const { address } = context

    try {
      const { blockedUsers, blockedByUsers } = await friends.getBlockingStatus(address)

      return {
        blockedUsers,
        blockedByUsers
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

import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'

export function getPendingFriendshipRequestsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-pending-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const pendingRequests = await db.getReceivedFriendshipRequests(context.address, request.pagination)
      const mappedRequests = pendingRequests.map(({ address, timestamp, metadata }) => ({
        user: { address },
        createdAt: new Date(timestamp).getTime(),
        message: metadata?.message || ''
      }))

      return {
        response: {
          $case: 'requests',
          requests: {
            requests: mappedRequests
          }
        }
      }
    } catch (error) {
      logger.error(error as any)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      }
    }
  }
}

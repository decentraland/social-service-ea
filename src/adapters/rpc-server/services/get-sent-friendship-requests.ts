import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  PaginatedFriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getSentFriendshipRequestsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendshipRequestsResponse> {
    try {
      const pendingRequests = await db.getSentFriendshipRequests(context.address, request.pagination)
      const mappedRequests = pendingRequests.map(({ id, address, timestamp, metadata }) => ({
        id,
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

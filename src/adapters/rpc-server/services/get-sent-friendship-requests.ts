import { RpcServerContext, RPCServiceContext } from '../../../types'
import {
  FriendshipRequestsResponse,
  GetFriendshipRequestsPayload
} from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'

export function getSentFriendshipRequestsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-sent-friendship-requests-service')

  return async function (
    request: GetFriendshipRequestsPayload,
    context: RpcServerContext
  ): Promise<FriendshipRequestsResponse> {
    try {
      const pendingRequests = await db.getSentFriendshipRequests(context.address, request.pagination)
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

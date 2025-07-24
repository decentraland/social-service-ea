import { BaseComponents, RpcServerContext, RPCServiceContext } from '../../types'
import {
  BlockUserResponse,
  GetBlockedUsersResponse,
  GetBlockingStatusResponse,
  GetFriendshipStatusResponse,
  GetPrivateMessagesSettingsResponse,
  GetSocialSettingsResponse,
  PaginatedFriendsProfilesResponse,
  SocialServiceDefinition,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export type ServiceCreator<T, C extends keyof BaseComponents = keyof BaseComponents> = (
  context: RPCServiceContext<C>
) => T

export enum ServiceType {
  CALL = 'call',
  STREAM = 'stream',
  COMMUNITIES = 'communities'
}

export enum StreamEvent {
  FRIENDSHIP_UPDATES = 'friendship_updates',
  FRIEND_CONNECTIVITY_UPDATES = 'friend_connectivity_updates',
  BLOCK_UPDATES = 'block_updates',
  PRIVATE_VOICE_CHAT_UPDATES = 'private_voice_chat_updates',
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES = 'community_member_connectivity_updates',
  COMMUNITY_VOICE_CHAT_UPDATES = 'community_voice_chat_updates'
}

type RpcCallMethod<TParams, TResult extends SocialServiceResponse, TContext> = (
  params: TParams,
  context: TContext
) => Promise<TResult>

type RpcStreamMethod<TParams, TResult, TContext> = (
  params: TParams,
  context: TContext
) => AsyncGenerator<TResult, void, unknown>

export type ServiceMethodDefinition =
  | {
      creator: RpcCallMethod<any, any, RpcServerContext>
      type: ServiceType.CALL
    }
  | {
      creator: RpcStreamMethod<any, any, RpcServerContext>
      type: ServiceType.STREAM
      event: StreamEvent
    }

type RpcServerMetrics = {
  withMetrics: <
    T extends Record<
      string,
      {
        creator: any
        type: ServiceType
        event?: string
      }
    >
  >(
    serviceCreators: T
  ) => { [K in keyof T]: T[K]['creator'] }
}

export enum RpcResponseCode {
  OK = 'OK',
  ERROR = 'ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  INVALID_FRIENDSHIP_ACTION = 'INVALID_FRIENDSHIP_ACTION',
  UNKNOWN = 'UNKNOWN',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN_ERROR = 'FORBIDDEN_ERROR',
  CONFLICTING_ERROR = 'CONFLICTING_ERROR'
}

const responseCaseToCodeMap: Record<string, RpcResponseCode> = {
  ok: RpcResponseCode.OK,
  accepted: RpcResponseCode.OK,
  requests: RpcResponseCode.OK,
  notFound: RpcResponseCode.NOT_FOUND,
  internalServerError: RpcResponseCode.INTERNAL_SERVER_ERROR,
  invalidRequest: RpcResponseCode.INVALID_REQUEST,
  profileNotFound: RpcResponseCode.PROFILE_NOT_FOUND,
  forbiddenError: RpcResponseCode.FORBIDDEN_ERROR,
  conflictingError: RpcResponseCode.CONFLICTING_ERROR,
  invalidFriendshipAction: RpcResponseCode.INVALID_FRIENDSHIP_ACTION,
  unknown: RpcResponseCode.UNKNOWN
}

type SocialServiceMethod = (typeof SocialServiceDefinition.methods)[keyof typeof SocialServiceDefinition.methods]
type SocialServiceResponse = ReturnType<SocialServiceMethod['responseType']['fromPartial']>

type ResponseWithCase =
  | UpsertFriendshipResponse
  | GetSocialSettingsResponse
  | BlockUserResponse
  | GetPrivateMessagesSettingsResponse
  | GetFriendshipStatusResponse

type ResponseWithPaginationData = PaginatedFriendsProfilesResponse | GetBlockedUsersResponse

type ResponsePatterns = Array<{
  check: (result: SocialServiceResponse) => boolean
  getCode: (result: SocialServiceResponse) => RpcResponseCode
}>

const responsePatterns: ResponsePatterns = [
  {
    check: (result: SocialServiceResponse): result is ResponseWithCase =>
      'response' in result && result.response !== undefined && '$case' in result.response,
    getCode: (result: SocialServiceResponse) => {
      const response = (result as ResponseWithCase).response
      return responseCaseToCodeMap[response?.$case || 'unknown'] || RpcResponseCode.UNKNOWN
    }
  },
  {
    check: (result: SocialServiceResponse): result is ResponseWithPaginationData => 'paginationData' in result,
    getCode: () => RpcResponseCode.OK
  },
  {
    check: (result: SocialServiceResponse): result is GetBlockingStatusResponse =>
      'blockedUsers' in result && 'blockedByUsers' in result,
    getCode: () => RpcResponseCode.OK
  }
]

export function createRpcServerMetricsWrapper({
  components: { metrics, logs }
}: RPCServiceContext<'metrics' | 'logs'>): RpcServerMetrics {
  const logger = logs.getLogger('rpc-server-metrics')

  function getMessageSize(msg: unknown): number {
    if (!msg) return 0

    try {
      return Buffer.from(JSON.stringify(msg)).length
    } catch (error: any) {
      logger.error('Error calculating message size', { error: error.message })
      return 0
    }
  }

  function recordRequestSize(procedureName: string, params: unknown): void {
    const requestSize = params ? getMessageSize(params) : 0
    metrics.observe('rpc_in_procedure_call_size_bytes', { procedure: procedureName }, requestSize)
  }

  function recordResponseSize(procedureName: string, code: string, response: unknown): void {
    const responseSize = response ? getMessageSize(response) : 0
    metrics.observe('rpc_out_procedure_call_size_bytes', { code, procedure: procedureName }, responseSize)
  }

  function recordCallMetrics(procedureName: string, code: string, startTime: number): void {
    metrics.increment('rpc_procedure_call_total', { code, procedure: procedureName })
    const duration = (Date.now() - startTime) / 1000
    metrics.observe('rpc_procedure_call_duration_seconds', { code, procedure: procedureName }, duration)
  }

  /**
   * Extracts the response code based on the result structure
   * Analyzes different response patterns in the protocol
   */
  function getResponseCode<T extends SocialServiceResponse>(result: T): RpcResponseCode {
    if (result === null || result === undefined || typeof result !== 'object') {
      return RpcResponseCode.UNKNOWN
    }

    for (const pattern of responsePatterns) {
      if (pattern.check(result)) {
        return pattern.getCode(result)
      }
    }

    return RpcResponseCode.UNKNOWN
  }

  function measureRpcCall<TParams extends Record<string, unknown> | void, TResult extends SocialServiceResponse>(
    procedureName: string,
    serviceFunction: RpcCallMethod<TParams, TResult, RpcServerContext>
  ): RpcCallMethod<TParams, TResult, RpcServerContext> {
    return async (params: TParams, context: RpcServerContext) => {
      const startTime = Date.now()

      try {
        recordRequestSize(procedureName, params)
        const result = await serviceFunction(params, context)

        // Determine the response code from the result structure
        const responseCode = getResponseCode(result)

        recordResponseSize(procedureName, responseCode, result)
        recordCallMetrics(procedureName, responseCode, startTime)

        return result
      } catch (error) {
        recordCallMetrics(procedureName, RpcResponseCode.ERROR, startTime)
        throw error
      }
    }
  }

  function measureRpcStream<TParams extends Record<string, unknown> | void, TResult>(
    procedureName: string,
    serviceFunction: RpcStreamMethod<TParams, TResult, RpcServerContext>,
    event: string
  ): RpcStreamMethod<TParams, TResult, RpcServerContext> {
    return async function* (params: TParams, context: RpcServerContext) {
      const startTime = Date.now()

      recordRequestSize(procedureName, params)

      try {
        const generator = serviceFunction(params, context)

        for await (const item of generator) {
          metrics.increment('rpc_updates_sent_on_subscription', { event })
          yield item
        }

        recordCallMetrics(procedureName, RpcResponseCode.OK, startTime)
      } catch (error) {
        recordCallMetrics(procedureName, RpcResponseCode.STREAM_ERROR, startTime)
        throw error
      }
    }
  }

  /**
   * Wraps the service creators with metrics
   * @param serviceCreators - The service creators to wrap
   * @returns The wrapped service creators
   * @throws An error if a stream service does not have an event property
   */
  function withMetrics<
    T extends Record<
      string,
      {
        creator: any
        type: ServiceType
        event?: string
      }
    >
  >(serviceCreators: T): { [K in keyof T]: T[K]['creator'] } {
    const result = {} as { [K in keyof T]: T[K]['creator'] }

    for (const key in serviceCreators) {
      if (Object.prototype.hasOwnProperty.call(serviceCreators, key)) {
        const definition = serviceCreators[key]

        if (definition.type === ServiceType.CALL) {
          result[key] = measureRpcCall(String(key), definition.creator)
        } else {
          if (!definition.event) {
            throw new Error(`Stream service "${String(key)}" must have an event property`)
          }
          result[key] = measureRpcStream(String(key), definition.creator, definition.event)
        }
      }
    }

    return result
  }

  return {
    withMetrics
  }
}

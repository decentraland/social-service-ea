import { BaseComponents, RpcServerContext, RPCServiceContext } from '../../types'

export type ServiceCreator<T, C extends keyof BaseComponents = keyof BaseComponents> = (
  context: RPCServiceContext<C>
) => T

export enum ServiceType {
  CALL = 'call',
  STREAM = 'stream'
}

type RpcCallMethod<TParams, TResult, TContext> = (params: TParams, context: TContext) => Promise<TResult>

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
      event: string
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

enum RpcErrorCode {
  OK = 'OK',
  ERROR = 'ERROR',
  STREAM_ERROR = 'STREAM_ERROR'
}

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

  function measureRpcCall<TParams extends Record<string, unknown> | void, TResult>(
    procedureName: string,
    serviceFunction: RpcCallMethod<TParams, TResult, RpcServerContext>
  ): RpcCallMethod<TParams, TResult, RpcServerContext> {
    return async (params: TParams, context: RpcServerContext) => {
      const startTime = Date.now()

      try {
        recordRequestSize(procedureName, params)
        const result = await serviceFunction(params, context)

        recordResponseSize(procedureName, RpcErrorCode.OK, result)
        recordCallMetrics(procedureName, RpcErrorCode.OK, startTime)

        return result
      } catch (error) {
        recordCallMetrics(procedureName, RpcErrorCode.ERROR, startTime)
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

        recordCallMetrics(procedureName, RpcErrorCode.OK, startTime)
      } catch (error) {
        recordCallMetrics(procedureName, RpcErrorCode.STREAM_ERROR, startTime)
        throw error
      }
    }
  }

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

import { RpcServerContext, RPCServiceContext } from '../../types'

type RpcServerMetrics = {
  measureRpcCall: <TParams extends Record<string, unknown> | void, TResult, TContext extends RpcServerContext>(
    procedureName: string,
    serviceFunction: (params: TParams, context: TContext) => Promise<TResult>
  ) => (params: TParams, context: TContext) => Promise<TResult>
  measureRpcStream: <TParams extends Record<string, unknown> | void, TResult, TContext extends RpcServerContext>(
    procedureName: string,
    serviceFunction: (params: TParams, context: TContext) => AsyncGenerator<TResult, void, unknown>
  ) => (params: TParams, context: TContext) => AsyncGenerator<TResult, void, unknown>
}

enum RpcErrorCode {
  OK = 'OK',
  ERROR = 'ERROR',
  STREAM_ERROR = 'STREAM_ERROR'
}

export function createRpcServerMetrics({
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

  function measureRpcCall<TParams extends Record<string, unknown> | void, TResult, TContext extends RpcServerContext>(
    procedureName: string,
    serviceFunction: (params: TParams, context: TContext) => Promise<TResult>
  ): (params: TParams, context: TContext) => Promise<TResult> {
    return async (params: TParams, context: TContext) => {
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

  function measureRpcStream<TParams extends Record<string, unknown> | void, TResult, TContext extends RpcServerContext>(
    procedureName: string,
    serviceFunction: (params: TParams, context: TContext) => AsyncGenerator<TResult, void, unknown>
  ): (params: TParams, context: TContext) => AsyncGenerator<TResult, void, unknown> {
    return async function* (params: TParams, context: TContext) {
      const startTime = Date.now()

      recordRequestSize(procedureName, params)

      try {
        const generator = serviceFunction(params, context)

        for await (const item of generator) {
          yield item
        }

        recordCallMetrics(procedureName, RpcErrorCode.OK, startTime)
      } catch (error) {
        recordCallMetrics(procedureName, RpcErrorCode.STREAM_ERROR, startTime)

        throw error
      }
    }
  }

  return {
    measureRpcCall,
    measureRpcStream
  }
}

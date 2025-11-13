import { IFetchComponent, Request, RequestOptions, Response } from '@well-known-components/interfaces'

// Maximum age for inflight requests before considering them hung (20 seconds)
const MAX_REQUEST_AGE_MS = 20000

interface InflightRequest {
  promise: Promise<Response>
  startTime: number
}

// Metrics tracking for deduplication effectiveness
const metrics = {
  totalRequests: 0,
  dedupeHits: 0,
  dedupeMisses: 0,
  hungCleanups: 0
}

export function withDeduplication(fetcher: IFetchComponent): IFetchComponent {
  const inflightRequests = new Map<string, InflightRequest>()

  async function fetch(url: Request, options?: RequestOptions): Promise<Response> {
    metrics.totalRequests++

    const method = (options?.method?.toUpperCase() || 'GET') as string
    const isGet = method === 'GET'

    let key: string
    if (isGet) {
      // TODO: URL must be normalized to prevent deduplication
      key = url.toString()
    } else {
      let bodyKey = ''
      // TODO: body should be sorted to prevent duplicated requests on different order
      if (options?.body) {
        if (typeof options.body === 'string') {
          bodyKey = options.body
        } else {
          try {
            bodyKey = JSON.stringify(options.body)
          } catch (error) {
            // If JSON.stringify fails, use a fallback to prevent deduplication
            // This ensures the request still goes through, just without deduplication
            bodyKey = `[non-serializable-${Date.now()}]`
          }
        }
      }
      key = `${method}:${url.toString()}:${bodyKey}`
    }

    const existingRequest = inflightRequests.get(key)
    if (existingRequest) {
      // Check if request is too old (hung/timed out)
      const age = Date.now() - existingRequest.startTime
      if (age > MAX_REQUEST_AGE_MS) {
        inflightRequests.delete(key)
        metrics.hungCleanups++
      } else {
        metrics.dedupeHits++
        return existingRequest.promise
      }
    }

    const startTime = Date.now()
    const promise = fetcher.fetch(url, options).finally(() => {
      const current = inflightRequests.get(key)
      if (current && current.promise === promise) {
        inflightRequests.delete(key)
      }
    })

    const newRequest: InflightRequest = { promise, startTime }

    inflightRequests.set(key, newRequest)
    metrics.dedupeMisses++
    return promise
  }

  return {
    fetch
  }
}

/**
 * Get current deduplication metrics
 * Returns metrics object with hit/miss counts
 */
export function getDedupeMetrics() {
  return {
    ...metrics,
    dedupeRate: metrics.totalRequests > 0 ? ((metrics.dedupeHits / metrics.totalRequests) * 100).toFixed(2) + '%' : '0%'
  }
}

/**
 * Reset all deduplication metrics to zero
 * Useful for testing or starting fresh measurement periods
 */
export function resetDedupeMetrics() {
  metrics.totalRequests = 0
  metrics.dedupeHits = 0
  metrics.dedupeMisses = 0
  metrics.hungCleanups = 0
}

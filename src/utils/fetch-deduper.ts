import { IFetchComponent, Request, RequestOptions, Response } from '@well-known-components/interfaces'

// Maximum age for inflight requests before considering them hung (20 seconds)
const MAX_REQUEST_AGE_MS = 20000

interface InflightRequest {
  promise: Promise<Response>
  startTime: number
}

export function withDeduplication(fetcher: IFetchComponent): IFetchComponent {
  const inflightRequests = new Map<string, InflightRequest>()

  async function fetch(url: Request, options?: RequestOptions): Promise<Response> {
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
      } else {
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
    return promise
  }

  return {
    fetch
  }
}

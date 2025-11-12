import { IFetchComponent, Request, RequestOptions, Response } from '@well-known-components/interfaces'

// TODO: make this component production-ready handling errors and timeouts
export function withDeduplication(fetcher: IFetchComponent): IFetchComponent {
  const inflightRequests = new Map<string, Promise<Response>>()

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

    // Atomic check-and-set to prevent race conditions
    let existingPromise = inflightRequests.get(key)
    if (existingPromise) {
      return existingPromise
    }

    // Create promise and set atomically
    const newPromise = fetcher.fetch(url, options).finally(() => {
      // Only delete if this is still the current promise (handles race condition)
      if (inflightRequests.get(key) === newPromise) {
        inflightRequests.delete(key)
      }
    })

    // Check again after creating promise (double-check pattern)
    existingPromise = inflightRequests.get(key)
    if (existingPromise) {
      return existingPromise
    }

    inflightRequests.set(key, newPromise)
    return newPromise
  }

  return {
    fetch
  }
}

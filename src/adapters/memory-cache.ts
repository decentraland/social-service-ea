import { ICacheComponent } from '../types'
import { LRUCache } from 'lru-cache'

export function createInMemoryCacheComponent(): ICacheComponent {
  const cache = new LRUCache<string, any>({
    max: 1000,
    ttl: 1000 * 60 * 60 * 2 // 2 hours
  })

  async function get<T>(key: string): Promise<T | null> {
    const value = cache.get(key)
    return value || null
  }

  async function put<T>(key: string, value: T): Promise<void> {
    cache.set(key, value)
  }

  return {
    get,
    put
  }
}

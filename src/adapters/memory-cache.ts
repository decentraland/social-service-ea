import { ICacheComponent } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'

export function createInMemoryCacheComponent(): ICacheComponent {
  const cache = new LRUCache<string, any>({
    max: 1000,
    ttl: 1000 * 60 * 60 * 2 // 2 hours
  })

  async function get(key: string): Promise<any> {
    return cache.get(key)
  }

  async function put(key: string, value: any): Promise<void> {
    cache.set(key, value)
  }

  return {
    get,
    put
  }
}

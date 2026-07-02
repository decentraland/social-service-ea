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

  async function mGet<T>(keys: string[]): Promise<T[]> {
    const values = await Promise.all(keys.map((key) => get<T>(key)))
    return values.filter((value) => value !== null) as T[]
  }

  return {
    get,
    put,
    mGet
  }
}

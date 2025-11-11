/**
 * Cached Fetch Component
 * 
 * Implements SWR (Stale-While-Revalidate) caching pattern with LRU cache for external API calls.
 * Features:
 * - In-memory LRU cache for fast access
 * - Request deduplication to prevent concurrent fetches
 * - Stale-while-revalidate pattern (serves stale data while refreshing)
 * - Batch fetching support (works with GET, POST, or any HTTP method)
 * 
 * @example Single fetch (GET or POST)
 * const profile = await cache.get('user:0x123', () => fetchProfile('0x123'))
 * 
 * @example Batch fetch with POST (e.g., Catalyst profiles)
 * const profiles = await cache.getMany(
 *   ['0x123', '0x456'],
 *   (ids) => catalystClient.getAvatarsDetailsByPost({ ids }), // POST with IDs in body
 *   (profile) => getProfileUserId(profile) // Extract key from response
 * )
 */

import { LRUCache } from 'lru-cache'
import { AppComponents, ICachedFetchComponent } from '../types'

export interface CachedFetchOptions {
  /**
   * Time to live in milliseconds - data is considered fresh for this duration
   * After TTL expires, data becomes stale but is still served while refreshing
   */
  ttl: number

  /**
   * Stale time in milliseconds - how long stale data is kept in cache
   * After staleTime expires, entry is deleted and next request fetches fresh
   * Default: 6x TTL (recommended for minimizing cache misses)
   */
  staleTime?: number

  /**
   * Maximum number of entries in cache
   * Default: 1000
   */
  maxSize?: number

  /**
   * Callback for background refresh errors
   * Useful for logging/metrics without blocking the response
   */
  onBackgroundRefreshError?: (error: Error, key: string) => void

  /**
   * Callback for cache misses
   * Useful for metrics tracking
   */
  onCacheMiss?: (key: string) => void

  /**
   * Callback for cache hits
   * Useful for metrics tracking
   */
  onCacheHit?: (key: string, isStale: boolean) => void
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Creates a cached fetch component with SWR pattern
 * 
 * @param components - App components (config, logs)
 * @param options - Cache configuration options
 * @returns Cached fetch component instance
 */
export async function createCachedFetchComponent(
  components: Pick<AppComponents, 'logs'>,
  options: CachedFetchOptions
): Promise<ICachedFetchComponent> {
  const { logs } = components
  const logger = logs.getLogger('cached-fetch')

  const {
    ttl,
    staleTime = ttl * 6, // Default: 6x TTL for optimal cache hit rate
    maxSize = 1000,
    onBackgroundRefreshError,
    onCacheMiss,
    onCacheHit
  } = options

  // Validate configuration
  if (ttl <= 0) {
    throw new Error('TTL must be greater than 0')
  }
  if (staleTime < ttl) {
    throw new Error('staleTime must be >= ttl')
  }
  if (maxSize <= 0) {
    throw new Error('maxSize must be greater than 0')
  }

  // LRU cache configured with staleTime as the deletion boundary
  // This ensures entries are kept in memory until staleTime expires
  // Our custom logic handles fresh vs stale distinction within this window
  const cache = new LRUCache<string, CacheEntry<unknown>>({
    max: maxSize,
    ttl: staleTime, // LRU deletes entries after staleTime (hard delete boundary)
    allowStale: true, // Allow retrieving stale entries before deletion
    updateAgeOnGet: false,
    updateAgeOnHas: false,
    ttlAutopurge: true // Auto-purge expired entries
  })

  // Track in-flight requests to prevent duplicate fetches
  // Key: cache key, Value: Promise resolving to the data
  const inflightRequests = new Map<string, Promise<unknown>>()

  /**
   * Check if cached entry is stale (older than TTL)
   */
  function isStale<T>(entry: CacheEntry<T>, ttlMs: number): boolean {
    return Date.now() - entry.timestamp > ttlMs
  }

  /**
   * Fetch data and update cache
   */
  async function fetchAndCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    try {
      const data = await fetchFn()
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now()
      }
      cache.set(key, entry)
      return data
    } catch (error) {
      // Remove from inflight on error so retry is possible
      inflightRequests.delete(key)
      throw error
    }
  }

  /**
   * Refresh data in background without blocking
   * Only refreshes if not already in flight
   */
  function refreshInBackground<T>(key: string, fetchFn: () => Promise<T>): void {
    // Don't refresh if already in flight
    if (inflightRequests.has(key)) {
      return
    }

    const promise = fetchAndCache(key, fetchFn)
    inflightRequests.set(key, promise)

    promise
      .catch((error) => {
        // Log but don't throw - we already returned stale data
        logger.warn('Background refresh failed', {
          key,
          error: error instanceof Error ? error.message : String(error)
        })
        if (onBackgroundRefreshError) {
          onBackgroundRefreshError(error instanceof Error ? error : new Error(String(error)), key)
        }
      })
      .finally(() => {
        inflightRequests.delete(key)
      })
  }

  /**
   * Get single value with SWR pattern
   */
  async function get<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = cache.get(key)

    // Case 1: Cache miss (never cached or LRU deleted after staleTime)
    if (!cached) {
      if (onCacheMiss) {
        onCacheMiss(key)
      }

      // Check if already fetching to avoid duplicate requests
      if (inflightRequests.has(key)) {
        return inflightRequests.get(key)! as Promise<T>
      }

      // Fetch synchronously on cache miss
      const promise = fetchAndCache(key, fetchFn)
      inflightRequests.set(key, promise)

      try {
        return await promise
      } finally {
        inflightRequests.delete(key)
      }
    }

    // Case 2: Fresh data (age <= ttl)
    if (!isStale(cached, ttl)) {
      if (onCacheHit) {
        onCacheHit(key, false)
      }
      return cached.data as T
    }

    // Case 3: Stale data (ttl < age <= staleTime)
    // We know it's not too stale because LRU hasn't deleted it yet
    // (LRU deletes entries after staleTime)
    if (onCacheHit) {
      onCacheHit(key, true)
    }
    refreshInBackground(key, fetchFn)
    return cached.data as T
  }

  /**
   * Get multiple values efficiently with batch fetching
   */
  async function getMany<T>(
    keys: string[],
    fetchFn: (missedKeys: string[]) => Promise<T[]>,
    keyExtractor: (item: T) => string
  ): Promise<T[]> {
    if (keys.length === 0) {
      return []
    }

    // Deduplicate keys
    const uniqueKeys = Array.from(new Set(keys))
    const results: (T | null)[] = new Array(keys.length)
    const keyToIndex = new Map<string, number[]>()

    // Map each key to its indices in the original array
    keys.forEach((key, index) => {
      if (!keyToIndex.has(key)) {
        keyToIndex.set(key, [])
      }
      keyToIndex.get(key)!.push(index)
    })

    // Check cache for all unique keys
    const missedKeys: string[] = []
    const cachedEntries = new Map<string, T>()

    for (const key of uniqueKeys) {
      const cached = cache.get(key)

      if (!cached) {
        // Cache miss
        missedKeys.push(key)
      } else if (!isStale(cached, ttl)) {
        // Fresh data
        cachedEntries.set(key, cached.data as T)
        if (onCacheHit) {
          onCacheHit(key, false)
        }
      } else {
        // Stale data - use it but refresh in background
        cachedEntries.set(key, cached.data as T)
        if (onCacheHit) {
          onCacheHit(key, true)
        }
        refreshInBackground(key, async () => {
          // For batch refresh, we need to fetch individually
          // This is less efficient but ensures correctness
          // Note: fetchFn should handle single-item arrays gracefully
          const fetched = await fetchFn([key])
          if (fetched.length === 0) {
            throw new Error(`No data returned for key: ${key}`)
          }
          return fetched[0]
        })
      }
    }

    // Fetch missing keys in batch
    if (missedKeys.length > 0) {
      if (onCacheMiss) {
        missedKeys.forEach((key) => onCacheMiss(key))
      }

      // Deduplicate inflight requests
      const keysToFetch: string[] = []
      const fetchPromises: Promise<T[]>[] = []

      for (const key of missedKeys) {
        if (inflightRequests.has(key)) {
          // Already fetching - wait for existing promise
          fetchPromises.push(
            (inflightRequests.get(key)! as Promise<T>).then((data) => [data])
          )
        } else {
          keysToFetch.push(key)
        }
      }

      // Batch fetch new keys
      if (keysToFetch.length > 0) {
        const batchPromise = (async () => {
          try {
            const fetched = await fetchFn(keysToFetch)
            // Cache all fetched items
            fetched.forEach((item) => {
              const itemKey = keyExtractor(item)
              cache.set(itemKey, {
                data: item,
                timestamp: Date.now()
              })
            })
            return fetched
          } catch (error) {
            // Remove from inflight on error
            keysToFetch.forEach((key) => inflightRequests.delete(key))
            throw error
          } finally {
            keysToFetch.forEach((key) => inflightRequests.delete(key))
          }
        })()

        // Track all keys as inflight
        keysToFetch.forEach((key) => {
          inflightRequests.set(key, batchPromise.then((items) => {
            const item = items.find((i) => keyExtractor(i) === key)
            if (!item) {
              throw new Error(`Fetched items missing key: ${key}`)
            }
            return item
          }))
        })

        fetchPromises.push(batchPromise)
      }

      // Wait for all fetches (both new and existing)
      const allFetched = await Promise.all(fetchPromises)
      const fetchedMap = new Map<string, T>()

      // Combine all fetched items
      // Each promise returns an array, so we flatten them
      for (const fetchedArray of allFetched) {
        for (const item of fetchedArray) {
          const itemKey = keyExtractor(item)
          fetchedMap.set(itemKey, item)
        }
      }

      // Add fetched items to cached entries
      fetchedMap.forEach((value, key) => {
        cachedEntries.set(key, value)
      })
    }

    // Build results array in original key order
    // Note: If a key is missing from cachedEntries, results[index] remains null
    keys.forEach((key, index) => {
      const value = cachedEntries.get(key)
      if (value !== undefined) {
        results[index] = value
      } else {
        // This shouldn't happen if fetchFn returns all requested keys
        // But we handle it gracefully for robustness
        logger.warn('Missing value for key in batch fetch result', { key, index })
      }
    })

    // Filter out nulls (shouldn't happen but safety check)
    const filtered = results.filter((r) => r !== null) as T[]
    
    // Warn if we lost some results
    if (filtered.length !== keys.length) {
      logger.warn('Batch fetch returned incomplete results', {
        requested: keys.length,
        received: filtered.length,
        missing: keys.length - filtered.length
      })
    }
    
    return filtered
  }

  /**
   * Manually set a value in cache
   */
  function set<T>(key: string, value: T): void {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now()
    }
    cache.set(key, entry)
  }

  /**
   * Delete a key from cache
   */
  function del(key: string): void {
    cache.delete(key)
    inflightRequests.delete(key) // Also remove from inflight if present
  }

  /**
   * Clear entire cache
   */
  function clear(): void {
    cache.clear()
    inflightRequests.clear()
  }

  /**
   * Get cache statistics
   */
  function stats() {
    return {
      size: cache.size,
      maxSize: cache.max,
      inflightRequests: inflightRequests.size
    }
  }

  logger.info('Cached fetch component initialized', {
    ttl: `${ttl}ms`,
    staleTime: `${staleTime}ms`,
    maxSize
  })

  return {
    get,
    getMany,
    set,
    del,
    clear,
    stats
  }
}

/**
 * Helper function to create cached fetch with config from environment variables
 * 
 * @param components - App components
 * @param configPrefix - Prefix for config keys (e.g., 'PROFILE_CACHE_' for PROFILE_CACHE_TTL)
 * @param defaults - Default values if config not found
 * @returns Cached fetch component instance
 */
export async function createCachedFetchFromConfig(
  components: Pick<AppComponents, 'config' | 'logs'>,
  configPrefix: string,
  defaults: {
    ttl: number
    staleTime?: number
    maxSize?: number
  }
): Promise<ICachedFetchComponent> {
  const { config } = components

  const ttl = (await config.getNumber(`${configPrefix}TTL`)) ?? defaults.ttl
  const staleTime = (await config.getNumber(`${configPrefix}STALE_TIME`)) ?? defaults.staleTime ?? ttl * 6
  const maxSize = (await config.getNumber(`${configPrefix}MAX_SIZE`)) ?? defaults.maxSize ?? 1000

  return createCachedFetchComponent(components, {
    ttl,
    staleTime,
    maxSize
  })
}


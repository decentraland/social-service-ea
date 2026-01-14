import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { AppComponents, IRegistryComponent } from '../types'
import { extractMinimalProfile, getProfileUserId } from '../logic/profiles'
import { withoutTracing } from '../utils/tracing'

export const PROFILE_CACHE_PREFIX = 'catalyst:minimal:profile:'

export async function createRegistryComponent({
  fetcher,
  config,
  redis,
  logs
}: Pick<AppComponents, 'fetcher' | 'config' | 'redis' | 'logs'>): Promise<IRegistryComponent> {
  const registryUrl = (await config.requireString('REGISTRY_URL')).replace(/\/+$/, '')
  const logger = logs.getLogger('registry')

  function getProfileCacheKey(id: string): string {
    return `${PROFILE_CACHE_PREFIX}${id}`
  }

  async function cacheProfile(profileId: string, profile: Profile): Promise<void> {
    try {
      const cacheKey = getProfileCacheKey(profileId)
      await redis.put(cacheKey, profile, {
        EX: 60 * 10 // 10 minutes
      })
    } catch (error: any) {
      logger.warn('Failed to store profile in cache', {
        error: error.message,
        profileId
      })
    }
  }

  async function getProfiles(ids: string[]): Promise<Profile[]> {
    if (ids.length === 0) return []

    const uniqueIds = Array.from(new Set(ids))
    const cacheKeys = uniqueIds.map((id) => getProfileCacheKey(id))

    const cachedProfiles = (await redis.mGet<Profile>(cacheKeys)).filter(Boolean) as Profile[]

    const idsToFetch = uniqueIds.filter(
      (id) =>
        !cachedProfiles.some((profile) => {
          try {
            return getProfileUserId(profile) === id.toLowerCase()
          } catch (err: any) {
            // Skip profiles that can't be processed (missing avatars, names, etc.)
            return false
          }
        })
    )

    let validProfiles: Profile[] = []

    if (idsToFetch.length > 0) {
      const response = await fetcher.fetch(`${registryUrl}/profiles`, {
        method: 'POST',
        body: JSON.stringify({ ids: idsToFetch })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch profiles from registry: ${response.statusText}`)
      }

      const registryResults = (await response.json()) as Profile[]

      const minimalProfiles = registryResults.map(extractMinimalProfile).filter(Boolean) as Profile[]
      validProfiles = minimalProfiles

      setImmediate(async () => {
        // Suppress tracing for fire-and-forget cache operations (breaks trace context)
        await withoutTracing(async () => {
          await Promise.all(
            minimalProfiles.map(async (minimalProfile) => {
              try {
                const userId = getProfileUserId(minimalProfile)
                await cacheProfile(userId, minimalProfile)
              } catch (error: any) {
                logger.warn('Failed to cache registry profile', {
                  error: error.message
                })
              }
            })
          ).catch((error) => {
            logger.error('Registry profile cache storing in batch failed', {
              error: error.message
            })
          })
        })
      })
    }

    return [...cachedProfiles, ...validProfiles]
  }

  async function getProfile(id: string): Promise<Profile> {
    const cachedProfile = await redis.get<Profile>(getProfileCacheKey(id))
    if (cachedProfile) {
      return cachedProfile
    }

    const response = await fetcher.fetch(`${registryUrl}/profiles`, {
      method: 'POST',
      body: JSON.stringify({ ids: [id] })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch profile from registry: ${response.statusText}`)
    }

    const registryResults = (await response.json()) as Profile[]

    if (registryResults.length === 0) {
      throw new Error(`Profile not found: ${id}`)
    }

    const minimalProfile = extractMinimalProfile(registryResults[0])

    if (!minimalProfile) {
      throw new Error(`Invalid profile received from registry: ${id}`)
    }

    setImmediate(async () => {
      // Suppress tracing for fire-and-forget cache operations (breaks trace context)
      await withoutTracing(async () => {
        return cacheProfile(id, minimalProfile)
      })
    })

    return minimalProfile
  }

  return {
    getProfiles,
    getProfile
  }
}

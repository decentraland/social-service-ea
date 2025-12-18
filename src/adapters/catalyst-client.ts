import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions, OwnedName } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { extractMinimalProfile, getProfileUserId } from '../logic/profiles'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export const PROFILE_CACHE_PREFIX = 'catalyst:minimal:profile:'

export async function createCatalystClient({
  registry,
  fetcher,
  config,
  redis,
  logs
}: Pick<AppComponents, 'registry' | 'fetcher' | 'config' | 'redis' | 'logs'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_LAMBDAS_URL_LOADBALANCER')
  const logger = logs.getLogger('catalyst-client')
  const env = await config.getString('ENV')
  const contractNetwork = env === 'prd' ? L1_MAINNET : L1_TESTNET

  function getLambdasClientOrDefault(lambdasServerUrl?: string): LambdasClient {
    return createLambdasClient({ fetcher, url: lambdasServerUrl ?? loadBalancer })
  }

  async function getProfilesFromRegistry(ids: string[]): Promise<Profile[]> {
    return registry.getProfiles(ids)
  }

  function rotateLambdasServerClient<T>(
    executeClientRequest: (client: LambdasClient) => Promise<T>,
    lambdasServerUrl?: string
  ) {
    const catalystServers = shuffleArray(getCatalystServersFromCache(contractNetwork)).map((server) => server.address)
    let lambdasClientToUse: LambdasClient = getLambdasClientOrDefault(lambdasServerUrl)

    return (attempt: number): Promise<T> => {
      if (attempt > 1 && catalystServers.length > 0) {
        const [catalystServerUrl] = catalystServers.splice(attempt % catalystServers.length, 1)
        lambdasClientToUse = getLambdasClientOrDefault(`${catalystServerUrl}/lambdas`)
      }

      return executeClientRequest(lambdasClientToUse)
    }
  }

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

  async function getProfiles(ids: string[], options: ICatalystClientRequestOptions = {}): Promise<Profile[]> {
    if (ids.length === 0) return []

    // Deduplicate IDs to avoid fetching the same profile multiple times
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
            // This ensures the function doesn't fail completely when some profiles are invalid
            return false
          }
        })
    )

    let validProfiles: Profile[] = []

    if (idsToFetch.length > 0) {
      // Try registry first
      let registryProfiles: Profile[] = []

      try {
        const registryResults = await getProfilesFromRegistry(idsToFetch)

        if (registryResults.length > 0) {
          // Extract minimal profiles and filter invalid ones
          const minimalRegistryProfiles = registryResults.map(extractMinimalProfile).filter(Boolean) as Profile[]

          // Cache registry profiles asynchronously without blocking the response
          setImmediate(() => {
            Promise.all(
              minimalRegistryProfiles.map(async (minimalProfile) => {
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

          registryProfiles = minimalRegistryProfiles
        }
      } catch (error: any) {
        logger.warn('Failed to fetch profiles from registry, falling back to Catalyst', {
          error: error.message,
          idsCount: idsToFetch.length
        })
      }

      const idsFromRegistry = new Set(
        registryProfiles
          .map((profile) => {
            try {
              return getProfileUserId(profile).toLowerCase()
            } catch {
              return ''
            }
          })
          .filter(Boolean)
      )

      const idsToFetchFromCatalyst = idsToFetch.filter((id) => !idsFromRegistry.has(id.toLowerCase()))

      // Fetch missing profiles from Catalyst if needed
      if (idsToFetchFromCatalyst.length > 0) {
        const { retries = 3, waitTime = 300, lambdasServerUrl } = options
        const executeClientRequest = rotateLambdasServerClient(
          (lambdasClientToUse) => lambdasClientToUse.getAvatarsDetailsByPost({ ids: idsToFetchFromCatalyst }),
          lambdasServerUrl
        )
        const fetchedProfiles = await retry(executeClientRequest, retries, waitTime)

        // Extract minimal profiles and cache them asynchronously (fire-and-forget)
        const minimalProfiles = fetchedProfiles.map(extractMinimalProfile).filter(Boolean) as Profile[]

        validProfiles = [...registryProfiles, ...minimalProfiles]

        // Cache Catalyst profiles asynchronously without blocking the response
        setImmediate(() => {
          Promise.all(
            minimalProfiles.map(async (minimalProfile) => {
              await cacheProfile(getProfileUserId(minimalProfile), minimalProfile)
            })
          ).catch((error) => {
            // Catch any unhandled promise rejections
            logger.error('Profile cache storing in batch failed', { error: error.message })
          })
        })
      } else {
        // All profiles were fetched from registry
        validProfiles = registryProfiles
      }
    }

    return [...cachedProfiles, ...validProfiles]
  }

  async function getProfile(id: string, options: ICatalystClientRequestOptions = {}): Promise<Profile> {
    const { retries = 3, waitTime = 300, lambdasServerUrl } = options

    // Try to get cached minimal profile
    const cachedProfile = await redis.get<Profile>(getProfileCacheKey(id))
    if (cachedProfile) {
      return cachedProfile
    }

    try {
      const registryProfiles = await getProfilesFromRegistry([id])

      if (registryProfiles.length > 0) {
        const minimalProfile = extractMinimalProfile(registryProfiles[0])

        if (minimalProfile) {
          // Cache registry profile asynchronously without blocking the response
          setImmediate(async () => {
            await cacheProfile(id, minimalProfile)
          })

          return minimalProfile
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from registry, falling back to Catalyst', {
        error: error.message,
        profileId: id
      })
    }

    // Fallback to Catalyst
    const executeClientRequest = rotateLambdasServerClient(
      (lambdasClientToUse) => lambdasClientToUse.getAvatarDetails(id),
      lambdasServerUrl
    )

    const response = await retry(executeClientRequest, retries, waitTime)
    const minimalProfile = extractMinimalProfile(response)

    if (!minimalProfile) {
      logger.warn(`Invalid profile received from Catalyst, not caching: ${JSON.stringify(response)}`)
      return response
    }

    // Cache profile asynchronously without blocking the response
    setImmediate(async () => {
      await cacheProfile(id, minimalProfile)
    })

    return minimalProfile
  }

  async function getOwnedNames(
    address: EthAddress,
    params?: GetNamesParams,
    options: ICatalystClientRequestOptions = {}
  ): Promise<OwnedName[]> {
    const { retries = 3, waitTime = 300, lambdasServerUrl } = options
    const executeClientRequest = rotateLambdasServerClient(
      (lambdasClientToUse) => lambdasClientToUse.getNames(address, params),
      lambdasServerUrl
    )

    const result = await retry(executeClientRequest, retries, waitTime)
    return result.elements.map((name) => ({
      id: name.tokenId,
      name: name.name,
      contractAddress: name.contractAddress,
      tokenId: name.tokenId
    }))
  }

  return { getProfiles, getProfile, getOwnedNames }
}

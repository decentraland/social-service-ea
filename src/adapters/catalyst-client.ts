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

export const PROFILE_CACHE_PREFIX = 'catalyst:profile:minimal:'

export async function createCatalystClient({
  fetcher,
  config,
  redis,
  logs
}: Pick<AppComponents, 'fetcher' | 'config' | 'redis' | 'logs'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_LAMBDAS_URL_LOADBALANCER')
  const logger = logs.getLogger('catalyst-client')
  const env = await config.getString('ENV')
  const contractNetwork = env === 'prd' ? L1_MAINNET : L1_TESTNET

  function getLambdasClientOrDefault(lambdasServerUrl?: string): LambdasClient {
    return createLambdasClient({ fetcher, url: lambdasServerUrl ?? loadBalancer })
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
      logger.warn('Failed to cache profile', {
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

    // Use mGet for efficient batch Redis retrieval
    console.time(`mGet:catalyst:profiles:${cacheKeys.length}`)
    const cachedProfiles = (await redis.mGet<Profile>(cacheKeys)).filter(Boolean) as Profile[]
    console.timeEnd(`mGet:catalyst:profiles:${cacheKeys.length}`)

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
      const { retries = 3, waitTime = 300, lambdasServerUrl } = options
      const executeClientRequest = rotateLambdasServerClient(
        (lambdasClientToUse) => lambdasClientToUse.getAvatarsDetailsByPost({ ids: idsToFetch }),
        lambdasServerUrl
      )
      const fetchedProfiles = await retry(executeClientRequest, retries, waitTime)

      // Extract minimal profiles and cache them asynchronously (fire-and-forget)
      const minimalProfiles = fetchedProfiles.map(extractMinimalProfile).filter(Boolean) as Profile[]

      validProfiles = minimalProfiles

      // Cache profiles asynchronously without blocking the response
      setImmediate(() => {
        Promise.all(
          minimalProfiles.map(async (minimalProfile) => {
            await cacheProfile(getProfileUserId(minimalProfile), minimalProfile)
          })
        ).catch((error) => {
          // Catch any unhandled promise rejections
          logger.error('Profile caching batch failed', { error: error.message })
        })
      })
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

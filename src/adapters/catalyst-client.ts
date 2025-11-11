import { ContentClient, createContentClient, createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions, OwnedName } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { extractMinimalProfile, getProfileUserId } from '../logic/profiles'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export async function createCatalystClient({
  fetcher,
  config,
  logs,
  profileCache
}: Pick<AppComponents, 'fetcher' | 'config' | 'logs' | 'profileCache'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_LAMBDAS_URL_LOADBALANCER')
  const logger = logs.getLogger('catalyst-client')
  const env = await config.getString('ENV')
  const contractNetwork = env === 'prd' ? L1_MAINNET : L1_TESTNET

  function getLambdasClientOrDefault(lambdasServerUrl?: string): LambdasClient {
    return createLambdasClient({ fetcher, url: lambdasServerUrl ?? loadBalancer })
  }

  function getContentClientOrDefault(contentServerUrl?: string): ContentClient {
    return createContentClient({ fetcher, url: contentServerUrl ?? loadBalancer })
  }

  function rotateContentServerClient<T>(
    executeClientRequest: (client: ContentClient) => Promise<T>,
    contentServerUrl?: string
  ) {
    const contentServers = shuffleArray(getCatalystServersFromCache(contractNetwork)).map((server) => server.address)
    let contentClientToUse: ContentClient = getContentClientOrDefault(contentServerUrl)

    return (attempt: number): Promise<T> => {
      if (attempt > 1 && contentServers.length > 0) {
        const [contentServerUrl] = contentServers.splice(attempt % contentServers.length, 1)
        contentClientToUse = getContentClientOrDefault(contentServerUrl)
      }
      return executeClientRequest(contentClientToUse)
    }
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

  async function getProfiles(ids: string[], options: ICatalystClientRequestOptions = {}): Promise<Profile[]> {
    if (ids.length === 0) return []

    // Use cached-fetch component with SWR pattern
    return await profileCache.getMany(
      ids.map((id) => id.toLowerCase()),
      async (missedIds: string[]) => {
        const { retries = 3, waitTime = 300, lambdasServerUrl } = options
        const executeClientRequest = rotateContentServerClient(
          (contentClientToUse) => contentClientToUse.fetchEntitiesByIds(missedIds),
          lambdasServerUrl
        )
        const fetchedProfiles = await retry(executeClientRequest, retries, waitTime)

        // Extract minimal profiles
        const minimalProfiles = fetchedProfiles
          .map((entity) => extractMinimalProfile(entity?.metadata as Profile))
          .filter(Boolean) as Profile[]

        return minimalProfiles
      },
      (profile: Profile) => getProfileUserId(profile).toLowerCase()
    )
  }

  async function getProfile(id: string, options: ICatalystClientRequestOptions = {}): Promise<Profile> {
    const normalizedId = id.toLowerCase()

    return await profileCache.get(normalizedId, async () => {
      const { retries = 3, waitTime = 300, lambdasServerUrl } = options
      const executeClientRequest = rotateContentServerClient(
        (contentClientToUse) => contentClientToUse.fetchEntityById(normalizedId),
        lambdasServerUrl
      )

      const response = await retry(executeClientRequest, retries, waitTime)
      const minimalProfile = extractMinimalProfile(response?.metadata as Profile)

      if (!minimalProfile) {
        logger.warn(`Invalid profile received from Catalyst, not caching: ${JSON.stringify(response)}`)
        return response?.metadata as Profile
      }

      return minimalProfile
    })
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

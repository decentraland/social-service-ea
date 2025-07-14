import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions, OwnedName } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export async function createCatalystClient({
  fetcher,
  config,
  redis
}: Pick<AppComponents, 'fetcher' | 'config' | 'redis'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_LAMBDAS_URL_LOADBALANCER')
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

  async function getProfiles(ids: string[], options: ICatalystClientRequestOptions = {}): Promise<Profile[]> {
    if (ids.length === 0) return []

    let response: Profile[] = []

    const cachedProfiles = (await Promise.all(ids.map((id) => redis.get(`catalyst:profile:${id}`))))
      .filter((profile) => profile !== null)
      .map((profile) => JSON.parse(profile as string)) as Profile[]

    const idsToFetch = ids.filter(
      (id) => !cachedProfiles.some((profile) => profile.avatars?.[0]?.ethAddress?.toLowerCase() === id.toLowerCase())
    )

    if (idsToFetch.length > 0) {
      const { retries = 3, waitTime = 300, lambdasServerUrl } = options
      const executeClientRequest = rotateLambdasServerClient(
        (lambdasClientToUse) => lambdasClientToUse.getAvatarsDetailsByPost({ ids: idsToFetch }),
        lambdasServerUrl
      )
      response = await retry(executeClientRequest, retries, waitTime)

      await Promise.all(
        response.map((profile) => {
          const cacheKey = `catalyst:profile:${profile.avatars?.[0]?.ethAddress}`
          return redis.put(cacheKey, JSON.stringify(profile), {
            EX: 60 * 10 // 10 minutes
          })
        })
      )
    }

    return [...cachedProfiles, ...response]
  }

  async function getProfile(id: string, options: ICatalystClientRequestOptions = {}): Promise<Profile> {
    const { retries = 3, waitTime = 300, lambdasServerUrl } = options

    const cachedProfile = await redis.get(`catalyst:profile:${id}`)
    if (cachedProfile) {
      return JSON.parse(cachedProfile as string) as Profile
    }

    const executeClientRequest = rotateLambdasServerClient(
      (lambdasClientToUse) => lambdasClientToUse.getAvatarDetails(id),
      lambdasServerUrl
    )

    const response = await retry(executeClientRequest, retries, waitTime)

    await redis.put(`catalyst:profile:${id}`, JSON.stringify(response), {
      EX: 60 * 10 // 10 minutes
    })

    return response
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

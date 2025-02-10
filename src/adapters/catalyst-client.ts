import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export async function createCatalystClient({
  fetcher,
  config
}: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_CONTENT_URL_LOADBALANCER')
  const contractNetwork = (await config.getString('ENV')) === 'prod' ? L1_MAINNET : L1_TESTNET

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

    const { retries = 3, waitTime = 300, lambdasServerUrl } = options
    const executeClientRequest = rotateLambdasServerClient(
      (lambdasClientToUse) => lambdasClientToUse.getAvatarsDetailsByPost({ ids: ids }),
      lambdasServerUrl
    )
    return retry(executeClientRequest, retries, waitTime)
  }

  async function getProfile(id: string, options: ICatalystClientRequestOptions = {}): Promise<Profile> {
    const { retries = 3, waitTime = 300, lambdasServerUrl } = options

    const executeClientRequest = rotateLambdasServerClient(
      (lambdasClientToUse) => lambdasClientToUse.getAvatarDetails(id),
      lambdasServerUrl
    )

    return retry(executeClientRequest, retries, waitTime)
  }

  return { getProfiles, getProfile }
}

import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions, OwnedName } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'
import { GetNamesParams } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export async function createCatalystClient({
  fetcher,
  config,
  logs
}: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_LAMBDAS_URL_LOADBALANCER')
  const env = await config.getString('ENV')
  const contractNetwork = env === 'prd' ? L1_MAINNET : L1_TESTNET
  const logger = logs.getLogger('catalyst-client')

  function getLambdasClientOrDefault(lambdasServerUrl?: string): LambdasClient {
    return createLambdasClient({
      fetcher,
      url: lambdasServerUrl ?? loadBalancer
    })
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

    try {
      const result = await retry(executeClientRequest, retries, waitTime, (error, attempt) =>
        logger.warn('Retrying owned names fetch after a failed attempt', {
          address,
          attempt,
          error: error.message
        })
      )
      return result.elements.map((name) => ({
        id: name.tokenId,
        name: name.name,
        contractAddress: name.contractAddress,
        tokenId: name.tokenId
      }))
    } catch (error: any) {
      logger.error('Failed to fetch owned names from catalyst', {
        address,
        error: error?.message ?? String(error)
      })
      throw error
    }
  }

  return { getOwnedNames }
}

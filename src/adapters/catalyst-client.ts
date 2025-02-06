import { Entity } from '@dcl/schemas'
import { createContentClient, ContentClient } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { AppComponents, ICatalystClientComponent, ICatalystClientRequestOptions } from '../types'
import { retry } from '../utils/retrier'
import { shuffleArray } from '../utils/array'

const L1_MAINNET = 'mainnet'
const L1_TESTNET = 'sepolia'

export async function createCatalystClient({
  fetcher,
  config
}: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>): Promise<ICatalystClientComponent> {
  const loadBalancer = await config.requireString('CATALYST_CONTENT_URL_LOADBALANCER')
  const contractNetwork = (await config.getString('ENV')) === 'prod' ? L1_MAINNET : L1_TESTNET

  function getContentClientOrDefault(contentServerUrl?: string): ContentClient {
    return createContentClient({ fetcher, url: contentServerUrl ?? loadBalancer })
  }

  function rotateContentServerClient<T>(
    executeClientRequest: (client: ContentClient) => Promise<T>,
    contentServerUrl?: string
  ) {
    const catalystServers = shuffleArray(getCatalystServersFromCache(contractNetwork)).map((server) => server.address)
    let contentClientToUse: ContentClient = getContentClientOrDefault(contentServerUrl)

    return (attempt: number): Promise<T> => {
      if (attempt > 1 && catalystServers.length > 0) {
        const [catalystServerUrl] = catalystServers.splice(attempt % catalystServers.length, 1)
        contentClientToUse = getContentClientOrDefault(`${catalystServerUrl}/content`)
      }

      return executeClientRequest(contentClientToUse)
    }
  }

  async function getEntitiesByPointers(
    pointers: string[],
    options: ICatalystClientRequestOptions = {}
  ): Promise<Entity[]> {
    if (pointers.length === 0) return []

    const { retries = 3, waitTime = 300, contentServerUrl } = options
    const executeClientRequest = rotateContentServerClient(
      (contentClientToUse) => contentClientToUse.fetchEntitiesByPointers(pointers),
      contentServerUrl
    )
    return retry(executeClientRequest, retries, waitTime)
  }

  async function getEntityByPointer(pointer: string, options: ICatalystClientRequestOptions = {}): Promise<Entity> {
    const [entity] = await getEntitiesByPointers([pointer], options)

    if (!entity) {
      throw new Error(`Entity not found for pointer ${pointer}`)
    }

    return entity
  }

  return { getEntitiesByPointers, getEntityByPointer }
}

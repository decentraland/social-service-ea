import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { AppComponents, IRegistryComponent } from '../types'

export async function createRegistryComponent({
  fetcher,
  config
}: Pick<AppComponents, 'fetcher' | 'config'>): Promise<IRegistryComponent> {
  const registryUrl = new URL(await config.requireString('REGISTRY_URL'))

  async function getProfiles(ids: string[]): Promise<Profile[]> {
    const response = await fetcher.fetch(registryUrl, {
      method: 'POST',
      body: JSON.stringify({ ids })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch profiles from registry: ${response.statusText}`)
    }

    return (await response.json()) as Profile[]
  }

  return {
    getProfiles
  }
}

import { AppComponents, IPlacesApiComponent } from '../types'

export type PlacesApiResponse = {
  total?: number
  ok: boolean
  data?: { id: string; title: string; positions: string[]; owner: string; world: boolean; world_name: string }[]
}

export async function createPlacesApiAdapter(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IPlacesApiComponent> {
  const { fetcher, config } = components

  const placesApiUrl = await config.requireString('PLACES_API_URL')

  return {
    getDestinations: async (placeIds: string[], worldNames: string[]): Promise<PlacesApiResponse['data']> => {
      if (placeIds.length === 0 && worldNames.length === 0) return []

      const response = await fetcher.fetch(`${placesApiUrl}/api/destinations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([...placeIds, ...worldNames])
      })

      if (!response.ok) {
        throw new Error('Failed to get destinations')
      }

      const parsedResponse = (await response.json()) as PlacesApiResponse

      return parsedResponse.data ?? []
    }
  }
}

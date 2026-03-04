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
    getPlaces: async (placesIds: string[]): Promise<PlacesApiResponse['data']> => {
      const response = await fetcher.fetch(`${placesApiUrl}/api/places`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(placesIds)
      })

      if (!response.ok) {
        throw new Error('Failed to get places')
      }

      const parsedResponse = (await response.json()) as PlacesApiResponse

      return parsedResponse.data ?? []
    },

    getWorlds: async (worldNames: string[]): Promise<PlacesApiResponse['data']> => {
      if (worldNames.length === 0) return []
      const params = worldNames.map((n) => `names=${encodeURIComponent(n)}`).join('&')
      const response = await fetcher.fetch(`${placesApiUrl}/api/worlds?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get worlds')
      }

      const parsedResponse = (await response.json()) as PlacesApiResponse

      return parsedResponse.data ?? []
    }
  }
}

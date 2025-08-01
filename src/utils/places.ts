/**
 * Utility functions for processing places data
 */

export interface PlaceData {
  positions: string[]
  world: boolean
  world_name?: string | null
}

export interface SeparatedPlacesData {
  positions: string[]
  worlds: string[]
}

/**
 * Separates places data into positions and worlds based on the 'world' field.
 * @param placesData - Array of place data from placesApi
 * @returns Object with separated positions and worlds arrays
 */
export function separatePositionsAndWorlds(placesData: PlaceData[]): SeparatedPlacesData {
  const positions: string[] = []
  const worlds: string[] = []

  placesData.forEach((place) => {
    if (place.world && place.world_name) {
      // It's a world - add world_name to worlds array
      worlds.push(place.world_name)
    } else {
      // It's a position - add positions to positions array
      positions.push(...place.positions)
    }
  })

  return {
    positions,
    worlds
  }
}

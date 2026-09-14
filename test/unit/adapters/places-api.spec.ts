import { createPlacesApiAdapter } from '../../../src/adapters/places-api'
import { IPlacesApiComponent } from '../../../src/types'
import { mockConfig, mockFetcher } from '../../mocks/components'

const PLACES_API_URL = 'https://places.decentraland.org'

describe('PlacesApiAdapter', () => {
  let placesApi: IPlacesApiComponent

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(PLACES_API_URL)
    placesApi = await createPlacesApiAdapter({ fetcher: mockFetcher, config: mockConfig })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('getDestinations', () => {
    describe('when both placeIds and worldNames are empty', () => {
      it('should return an empty array without calling the API', async () => {
        const result = await placesApi.getDestinations([], [])

        expect(result).toEqual([])
        expect(mockFetcher.fetch).not.toHaveBeenCalled()
      })
    })

    describe('when only placeIds are provided', () => {
      it('should send them in the POST body and return the destinations', async () => {
        const placeIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890']
        const destination = { id: placeIds[0], title: 'Genesis Plaza', positions: ['0,0'], owner: '0xabc', world: false, world_name: '' }

        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ ok: true, data: [destination] })
        } as any)

        const result = await placesApi.getDestinations(placeIds, [])

        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${PLACES_API_URL}/api/destinations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(placeIds)
        })
        expect(result).toEqual([destination])
      })
    })

    describe('when only worldNames are provided', () => {
      it('should send them in the POST body and return the destinations', async () => {
        const worldNames = ['myworld.dcl.eth']
        const destination = { id: worldNames[0], title: 'My World', positions: [], owner: '0xabc', world: true, world_name: worldNames[0] }

        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ ok: true, data: [destination] })
        } as any)

        const result = await placesApi.getDestinations([], worldNames)

        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${PLACES_API_URL}/api/destinations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(worldNames)
        })
        expect(result).toEqual([destination])
      })
    })

    describe('when both placeIds and worldNames are provided', () => {
      it('should merge them into a single POST body', async () => {
        const placeIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890']
        const worldNames = ['myworld.dcl.eth']
        const destinations = [
          { id: placeIds[0], title: 'Genesis Plaza', positions: ['0,0'], owner: '0xabc', world: false, world_name: '' },
          { id: worldNames[0], title: 'My World', positions: [], owner: '0xabc', world: true, world_name: worldNames[0] }
        ]

        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ ok: true, data: destinations })
        } as any)

        const result = await placesApi.getDestinations(placeIds, worldNames)

        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${PLACES_API_URL}/api/destinations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([...placeIds, ...worldNames])
        })
        expect(result).toEqual(destinations)
      })
    })

    describe('when the API response has no data field', () => {
      it('should return an empty array', async () => {
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ ok: true })
        } as any)

        const result = await placesApi.getDestinations(['a1b2c3d4-e5f6-7890-abcd-ef1234567890'], [])

        expect(result).toEqual([])
      })
    })

    describe('when the fetch response is not ok', () => {
      it('should throw an error', async () => {
        mockFetcher.fetch.mockResolvedValue({ ok: false } as any)

        await expect(placesApi.getDestinations(['a1b2c3d4-e5f6-7890-abcd-ef1234567890'], [])).rejects.toThrow(
          'Failed to get destinations'
        )
      })
    })

    describe('when the fetch throws', () => {
      it('should propagate the error', async () => {
        mockFetcher.fetch.mockRejectedValue(new Error('Network error'))

        await expect(placesApi.getDestinations(['a1b2c3d4-e5f6-7890-abcd-ef1234567890'], [])).rejects.toThrow(
          'Network error'
        )
      })
    })
  })
})

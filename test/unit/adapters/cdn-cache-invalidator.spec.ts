import { createCdnCacheInvalidatorComponent } from '../../../src/adapters/cdn-cache-invalidator'
import { mockConfig, mockFetcher } from '../../mocks/components'
import { ICdnCacheInvalidatorComponent } from '../../../src/types'
import { getCommunityThumbnailPath } from '../../../src/logic/community'

jest.mock('../../../src/logic/community', () => ({
  getCommunityThumbnailPath: jest.fn()
}))

describe('CDN Cache Invalidator Component', () => {
  let cdnCacheInvalidator: ICdnCacheInvalidatorComponent
  const mockGetCommunityThumbnailPath = getCommunityThumbnailPath as jest.MockedFunction<typeof getCommunityThumbnailPath>

  const mockConfigValues = {
    CDN_CACHE_INVALIDATOR_API_URL: 'https://cdn-cache-invalidator.example.com',
    CDN_CACHE_INVALIDATOR_API_TOKEN: 'test-api-key',
    CDN_URL: 'https://cdn.example.com'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createCdnCacheInvalidatorComponent', () => {
    describe('when all required configuration is provided', () => {
      beforeEach(() => {
        mockConfig.requireString
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL)
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN)
          .mockResolvedValueOnce(mockConfigValues.CDN_URL)
      })

      it('should create a CDN cache invalidator component with required configuration', async () => {
        cdnCacheInvalidator = await createCdnCacheInvalidatorComponent({
          config: mockConfig,
          fetcher: mockFetcher
        })

        expect(mockConfig.requireString).toHaveBeenCalledWith('CDN_CACHE_INVALIDATOR_API_URL')
        expect(mockConfig.requireString).toHaveBeenCalledWith('CDN_CACHE_INVALIDATOR_API_TOKEN')
        expect(mockConfig.requireString).toHaveBeenCalledWith('CDN_URL')
        expect(cdnCacheInvalidator).toHaveProperty('invalidateThumbnail')
      })
    })

    describe('when CDN_CACHE_INVALIDATOR_API_URL is missing', () => {
      beforeEach(() => {
        mockConfig.requireString.mockRejectedValueOnce(new Error('Missing CDN_CACHE_INVALIDATOR_API_URL'))
      })

      it('should throw an error', async () => {
        await expect(
          createCdnCacheInvalidatorComponent({
            config: mockConfig,
            fetcher: mockFetcher
          })
        ).rejects.toThrow('Missing CDN_CACHE_INVALIDATOR_API_URL')
      })
    })

    describe('when CDN_CACHE_INVALIDATOR_API_TOKEN is missing', () => {
      beforeEach(() => {
        mockConfig.requireString
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL)
          .mockRejectedValueOnce(new Error('Missing CDN_CACHE_INVALIDATOR_API_TOKEN'))
      })

      it('should throw an error', async () => {
        await expect(
          createCdnCacheInvalidatorComponent({
            config: mockConfig,
            fetcher: mockFetcher
          })
        ).rejects.toThrow('Missing CDN_CACHE_INVALIDATOR_API_TOKEN')
      })
    })

    describe('when CDN_URL is missing', () => {
      beforeEach(() => {
        mockConfig.requireString
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL)
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN)
          .mockRejectedValueOnce(new Error('Missing CDN_URL'))
      })

      it('should throw an error', async () => {
        await expect(
          createCdnCacheInvalidatorComponent({
            config: mockConfig,
            fetcher: mockFetcher
          })
        ).rejects.toThrow('Missing CDN_URL')
      })
    })
  })

  describe('invalidateThumbnail', () => {
    describe('when component is properly initialized', () => {
      beforeEach(async () => {
        mockConfig.requireString
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL)
          .mockResolvedValueOnce(mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN)
          .mockResolvedValueOnce(mockConfigValues.CDN_URL)

        cdnCacheInvalidator = await createCdnCacheInvalidatorComponent({
          config: mockConfig,
          fetcher: mockFetcher
        })
      })

      describe('and API response is successful', () => {
        beforeEach(() => {
          mockFetcher.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          } as any)
        })

        it('should call the API with the correct parameters', async () => {
          const communityId = 'test-community-id'
          const expectedThumbnailPath = '/social/communities/test-community-id/raw-thumbnail.png'
          mockGetCommunityThumbnailPath.mockReturnValue(expectedThumbnailPath)

          await cdnCacheInvalidator.invalidateThumbnail(communityId)

          expect(mockGetCommunityThumbnailPath).toHaveBeenCalledWith(communityId)
          expect(mockFetcher.fetch).toHaveBeenCalledWith(
            `${mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL}/invalidate`,
            {
              method: 'POST',
              body: JSON.stringify({
                files: [expectedThumbnailPath],
                cfDomain: mockConfigValues.CDN_URL
              }),
              headers: {
                Authorization: `Bearer ${mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN}`
              }
            }
          )
        })

        it('should call the API with the correct parameters for a different community ID', async () => {
          const communityId = 'another-community-123'
          const expectedThumbnailPath = '/social/communities/another-community-123/raw-thumbnail.png'
          mockGetCommunityThumbnailPath.mockReturnValue(expectedThumbnailPath)

          await cdnCacheInvalidator.invalidateThumbnail(communityId)

          expect(mockGetCommunityThumbnailPath).toHaveBeenCalledWith(communityId)
          expect(mockFetcher.fetch).toHaveBeenCalledWith(
            `${mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL}/invalidate`,
            {
              method: 'POST',
              body: JSON.stringify({
                files: [expectedThumbnailPath],
                cfDomain: mockConfigValues.CDN_URL
              }),
              headers: {
                Authorization: `Bearer ${mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN}`
              }
            }
          )
        })

        it('should call the API with the correct request structure to invalidate CloudFlare cache', async () => {
          const communityId = 'test-community-id'
          const expectedThumbnailPath = '/social/communities/test-community-id/raw-thumbnail.png'
          mockGetCommunityThumbnailPath.mockReturnValue(expectedThumbnailPath)

          await cdnCacheInvalidator.invalidateThumbnail(communityId)

          const fetchCall = mockFetcher.fetch.mock.calls[0]
          const [url, options] = fetchCall

          expect(url).toBe(`${mockConfigValues.CDN_CACHE_INVALIDATOR_API_URL}/invalidate`)
          expect(options.method).toBe('POST')
          expect(options.headers).toEqual({
            Authorization: `Bearer ${mockConfigValues.CDN_CACHE_INVALIDATOR_API_TOKEN}`
          })

          const body = JSON.parse(options.body as string)
          expect(body).toEqual({
            files: [expectedThumbnailPath],
            cfDomain: mockConfigValues.CDN_URL
          })
        })
      })

      describe('and fetch fails with network error', () => {
        beforeEach(() => {
          const fetchError = new Error('Network error')
          mockFetcher.fetch.mockRejectedValueOnce(fetchError)
        })

        it('should throw the network error', async () => {
          const communityId = 'test-community-id'
          await expect(cdnCacheInvalidator.invalidateThumbnail(communityId)).rejects.toThrow('Network error')
        })
      })

      describe('and API returns error responses', () => {
        it('should handle 500 internal server error gracefully', async () => {
          const communityId = 'test-community-id'
          mockFetcher.fetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          } as any)

          // Should not throw error, CDN invalidation is best effort
          await expect(cdnCacheInvalidator.invalidateThumbnail(communityId)).resolves.toBeUndefined()
        })

        it('should handle 401 unauthorized error gracefully', async () => {
          const communityId = 'test-community-id'
          mockFetcher.fetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          } as any)

          // Should not throw error, CDN invalidation is best effort
          await expect(cdnCacheInvalidator.invalidateThumbnail(communityId)).resolves.toBeUndefined()
        })
      })
    })
  })
})

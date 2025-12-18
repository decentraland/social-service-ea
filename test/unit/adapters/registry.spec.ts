import { createRegistryComponent } from '../../../src/adapters/registry'
import { IRegistryComponent } from '../../../src/types'
import { mockConfig, mockFetcher, mockRedis, mockLogs } from '../../mocks/components'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { mockProfile } from '../../mocks/profile'
import { PROFILE_CACHE_PREFIX } from '../../../src/adapters/catalyst-client'

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

const REGISTRY_URL = 'https://registry.example.com'

describe('registry', () => {
  let registry: IRegistryComponent

  function getProfileCacheKey(id: string): string {
    return `${PROFILE_CACHE_PREFIX}${id}`
  }

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(REGISTRY_URL)
    mockFetcher.fetch.mockReset()

    registry = await createRegistryComponent({
      fetcher: mockFetcher,
      config: mockConfig,
      redis: mockRedis,
      logs: mockLogs
    })

    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  describe('when getting profiles', () => {
    const profileIds = ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']
    const mockProfiles: Profile[] = [
      {
        avatars: [
          {
            ethAddress: '0x1234567890123456789012345678901234567890',
            userId: '0x1234567890123456789012345678901234567890',
            name: 'TestUser1',
            unclaimedName: undefined,
            hasClaimedName: true,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar1.jpg'
              }
            }
          }
        ]
      },
      {
        avatars: [
          {
            ethAddress: '0x0987654321098765432109876543210987654321',
            userId: '0x0987654321098765432109876543210987654321',
            name: 'TestUser2',
            unclaimedName: undefined,
            hasClaimedName: false,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar2.jpg'
              }
            }
          }
        ]
      }
    ]

    beforeEach(() => {
      mockRedis.get.mockReset()
      mockRedis.put.mockReset()
    })

    describe('and no profiles are cached', () => {
      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null, null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfiles
        } as any)
      })

      it('should fetch all profiles from registry API using mGet', async () => {
        const result = await registry.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          expect.any(URL),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ ids: profileIds })
          })
        )

        // Expect minimal profiles (without ethAddress)
        expect(result).toEqual([
          {
            avatars: [
              {
                userId: '0x1234567890123456789012345678901234567890',
                name: 'TestUser1',
                unclaimedName: undefined,
                hasClaimedName: true,
                avatar: {
                  snapshots: {
                    face256: 'https://example.com/avatar1.jpg'
                  }
                }
              }
            ]
          },
          {
            avatars: [
              {
                userId: '0x0987654321098765432109876543210987654321',
                name: 'TestUser2',
                unclaimedName: undefined,
                hasClaimedName: false,
                avatar: {
                  snapshots: {
                    face256: 'https://example.com/avatar2.jpg'
                  }
                }
              }
            ]
          }
        ])
      })

      it('should cache fetched profiles as minimal profiles with correct expiration', async () => {
        await registry.getProfiles(profileIds)

        jest.runOnlyPendingTimers()

        expect(mockRedis.put).toHaveBeenCalledTimes(2)

        const firstCall = mockRedis.put.mock.calls[0]
        expect(firstCall[0]).toBe(getProfileCacheKey('0x1234567890123456789012345678901234567890'))
        expect(firstCall[2]).toEqual({ EX: 60 * 10 })
        expect(firstCall[1]).toEqual({
          avatars: [
            {
              userId: '0x1234567890123456789012345678901234567890',
              name: 'TestUser1',
              unclaimedName: undefined,
              hasClaimedName: true,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar1.jpg'
                }
              }
            }
          ]
        })

        const secondCall = mockRedis.put.mock.calls[1]
        expect(secondCall[0]).toBe(getProfileCacheKey('0x0987654321098765432109876543210987654321'))
        expect(secondCall[2]).toEqual({ EX: 60 * 10 })
      })
    })

    describe('and some profiles are cached', () => {
      const cachedProfile = {
        avatars: [
          {
            ethAddress: '0x1234567890123456789012345678901234567890',
            userId: '0x1234567890123456789012345678901234567890',
            name: 'CachedUser',
            unclaimedName: undefined,
            hasClaimedName: true,
            avatar: {
              snapshots: {
                face256: 'https://example.com/cached.jpg'
              }
            }
          }
        ]
      }
      const fetchedProfile = {
        avatars: [
          {
            ethAddress: '0x0987654321098765432109876543210987654321',
            userId: '0x0987654321098765432109876543210987654321',
            name: 'FetchedUser',
            unclaimedName: undefined,
            hasClaimedName: false,
            avatar: {
              snapshots: {
                face256: 'https://example.com/fetched.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([cachedProfile, null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [fetchedProfile]
        } as any)
      })

      it('should return cached profiles and fetch missing ones using mGet', async () => {
        const result = await registry.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          expect.any(URL),
          expect.objectContaining({
            body: JSON.stringify({ ids: ['0x0987654321098765432109876543210987654321'] })
          })
        )
        expect(result).toHaveLength(2)

        const expectedFetchedProfile = {
          avatars: [
            {
              userId: '0x0987654321098765432109876543210987654321',
              name: 'FetchedUser',
              unclaimedName: undefined,
              hasClaimedName: false,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/fetched.jpg'
                }
              }
            }
          ]
        }

        expect(result).toEqual(expect.arrayContaining([cachedProfile, expectedFetchedProfile]))
      })

      it('should cache only the newly fetched profiles as minimal profiles', async () => {
        await registry.getProfiles(profileIds)

        jest.runOnlyPendingTimers()

        expect(mockRedis.put).toHaveBeenCalledTimes(1)
        expect(mockRedis.put).toHaveBeenCalledWith(
          getProfileCacheKey('0x0987654321098765432109876543210987654321'),
          {
            avatars: [
              {
                userId: '0x0987654321098765432109876543210987654321',
                name: 'FetchedUser',
                unclaimedName: undefined,
                hasClaimedName: false,
                avatar: {
                  snapshots: {
                    face256: 'https://example.com/fetched.jpg'
                  }
                }
              }
            ]
          },
          { EX: 60 * 10 }
        )
      })
    })

    describe('and all profiles are cached', () => {
      const cachedProfile1 = {
        avatars: [
          {
            ethAddress: '0x1234567890123456789012345678901234567890',
            userId: '0x1234567890123456789012345678901234567890',
            name: 'CachedUser1',
            unclaimedName: undefined,
            hasClaimedName: true,
            avatar: {
              snapshots: {
                face256: 'https://example.com/cached1.jpg'
              }
            }
          }
        ]
      }
      const cachedProfile2 = {
        avatars: [
          {
            ethAddress: '0x0987654321098765432109876543210987654321',
            userId: '0x0987654321098765432109876543210987654321',
            name: 'CachedUser2',
            unclaimedName: undefined,
            hasClaimedName: false,
            avatar: {
              snapshots: {
                face256: 'https://example.com/cached2.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([cachedProfile1, cachedProfile2])
      })

      it('should return all cached profiles without fetching from registry using mGet', async () => {
        const result = await registry.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(mockFetcher.fetch).not.toHaveBeenCalled()
        expect(result).toEqual([cachedProfile1, cachedProfile2])
      })
    })

    describe('and no profile IDs are provided', () => {
      it('should return empty array without making any requests', async () => {
        const result = await registry.getProfiles([])

        expect(mockRedis.mGet).not.toHaveBeenCalled()
        expect(mockFetcher.fetch).not.toHaveBeenCalled()
        expect(result).toEqual([])
      })
    })

    describe('and duplicate profile IDs are provided', () => {
      const duplicateProfileIds = [
        '0x1234567890123456789012345678901234567890',
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321'
      ]

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null, null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfiles
        } as any)
      })

      it('should deduplicate IDs and return profiles', async () => {
        const result = await registry.getProfiles(duplicateProfileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          expect.any(URL),
          expect.objectContaining({
            body: JSON.stringify({
              ids: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']
            })
          })
        )
        expect(result).toHaveLength(2)
      })
    })

    describe('and registry API returns invalid profiles', () => {
      const invalidProfile = {
        avatars: [] // This will cause extractMinimalProfile to return null
      }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [invalidProfile]
        } as any)
      })

      it('should filter out invalid profiles', async () => {
        const result = await registry.getProfiles([profileIds[0]])

        expect(result).toHaveLength(0)
      })
    })

    describe('and registry API fails', () => {
      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null, null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: false,
          statusText: 'Internal Server Error'
        } as any)
      })

      it('should throw an error', async () => {
        await expect(registry.getProfiles(profileIds)).rejects.toThrow('Failed to fetch profiles from registry')
      })
    })

    describe('and registry API returns empty array', () => {
      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null, null])
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => []
        } as any)
      })

      it('should return empty array', async () => {
        const result = await registry.getProfiles(profileIds)

        expect(result).toEqual([])
      })
    })
  })

  describe('when getting a single profile', () => {
    const profileId = '0x1234567890123456789012345678901234567890'

    beforeEach(() => {
      mockRedis.get.mockReset()
      mockRedis.put.mockReset()
    })

    describe('and the profile is not cached', () => {
      beforeEach(() => {
        mockRedis.get.mockResolvedValue(null)
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [mockProfile]
        } as any)
      })

      it('should fetch profile from registry API', async () => {
        const result = await registry.getProfile(profileId)

        expect(mockRedis.get).toHaveBeenCalledWith(getProfileCacheKey(profileId))
        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          expect.any(URL),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ ids: [profileId] })
          })
        )
        expect(result).toEqual(mockProfile)
      })

      it('should cache the fetched profile with correct expiration', async () => {
        await registry.getProfile(profileId)

        jest.runOnlyPendingTimers()

        expect(mockRedis.put).toHaveBeenCalledWith(getProfileCacheKey(profileId), mockProfile, { EX: 60 * 10 })
      })
    })

    describe('and the profile is cached', () => {
      const cachedProfile = { avatars: [{ ethAddress: profileId, userId: profileId }] }

      beforeEach(() => {
        mockRedis.get.mockResolvedValue(cachedProfile)
      })

      it('should return cached profile without fetching from registry', async () => {
        const result = await registry.getProfile(profileId)

        expect(mockFetcher.fetch).not.toHaveBeenCalled()
        expect(result).toEqual(cachedProfile)
      })
    })

    describe('and registry API returns empty array', () => {
      beforeEach(() => {
        mockRedis.get.mockResolvedValue(null)
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => []
        } as any)
      })

      it('should throw an error', async () => {
        await expect(registry.getProfile(profileId)).rejects.toThrow('Profile not found')
      })
    })

    describe('and registry API returns invalid profile', () => {
      const invalidProfile = {
        avatars: [] // This will cause extractMinimalProfile to return null
      }

      beforeEach(() => {
        mockRedis.get.mockResolvedValue(null)
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [invalidProfile]
        } as any)
      })

      it('should throw an error', async () => {
        await expect(registry.getProfile(profileId)).rejects.toThrow('Invalid profile received from registry')
      })
    })

    describe('and registry API fails', () => {
      beforeEach(() => {
        mockRedis.get.mockResolvedValue(null)
        mockFetcher.fetch.mockResolvedValueOnce({
          ok: false,
          statusText: 'Not Found'
        } as any)
      })

      it('should throw an error', async () => {
        await expect(registry.getProfile(profileId)).rejects.toThrow('Failed to fetch profile from registry')
      })
    })
  })
})


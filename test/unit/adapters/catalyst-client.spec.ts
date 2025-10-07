import { createCatalystClient, PROFILE_CACHE_PREFIX } from '../../../src/adapters/catalyst-client'
import { ICatalystClientComponent } from '../../../src/types'
import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { mockConfig, mockFetcher, mockRedis, mockLogs } from '../../mocks/components'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { mockProfile } from '../../mocks/profile'

jest.mock('dcl-catalyst-client', () => ({
  ...jest.requireActual('dcl-catalyst-client'),
  createLambdasClient: jest.fn().mockReturnValue({
    getAvatarsDetailsByPost: jest.fn(),
    getAvatarDetails: jest.fn(),
    getNames: jest.fn()
  })
}))

jest.mock('dcl-catalyst-client/dist/contracts-snapshots', () => ({
  getCatalystServersFromCache: jest
    .fn()
    .mockReturnValue([
      { address: 'http://catalyst-server-1.com' },
      { address: 'http://catalyst-server-2.com' },
      { address: 'http://catalyst-server-3.com' }
    ])
}))

jest.mock('../../../src/utils/array', () => ({
  shuffleArray: jest.fn((array) => array) // for predictability
}))

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

const CATALYST_LAMBDAS_LOAD_BALANCER_URL = 'http://catalyst-server.com/lambdas'

describe('catalyst-client', () => {
  let catalystClient: ICatalystClientComponent
  let lambdasClientMock: LambdasClient

  function getProfileCacheKey(id: string): string {
    return `${PROFILE_CACHE_PREFIX}${id}`
  }

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(CATALYST_LAMBDAS_LOAD_BALANCER_URL)
    mockConfig.getString.mockResolvedValue('test') // ENV

    catalystClient = await createCatalystClient({
      fetcher: mockFetcher,
      config: mockConfig,
      redis: mockRedis,
      logs: mockLogs
    })
    lambdasClientMock = createLambdasClient({ fetcher: mockFetcher, url: CATALYST_LAMBDAS_LOAD_BALANCER_URL })

    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
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
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue(mockProfiles)
      })

      it('should fetch all profiles from catalyst server using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: profileIds })

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
        await catalystClient.getProfiles(profileIds)

        jest.runOnlyPendingTimers()

        expect(mockRedis.put).toHaveBeenCalledTimes(2)

        // Check that minimal profiles are cached (only essential properties)
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
        expect(secondCall[1]).toEqual({
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
        })
      })

      describe('and the catalyst server fails', () => {
        beforeEach(() => {
          lambdasClientMock.getAvatarsDetailsByPost = jest
            .fn()
            .mockRejectedValueOnce(new Error('Server error'))
            .mockResolvedValueOnce(mockProfiles)
        })

        it('should retry the request', async () => {
          const result = await catalystClient.getProfiles(profileIds)

          expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledTimes(2)

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
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([fetchedProfile])
      })

      it('should return cached profiles and fetch missing ones using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({
          ids: ['0x0987654321098765432109876543210987654321']
        })
        expect(result).toHaveLength(2)

        // Cached profile keeps original structure, fetched profile becomes minimal
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
        await catalystClient.getProfiles(profileIds)

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

      it('should return all cached profiles without fetching from server using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).not.toHaveBeenCalled()
        expect(result).toEqual([cachedProfile1, cachedProfile2])
      })
    })

    describe('and case-insensitive address matching is needed', () => {
      const cachedProfile = {
        avatars: [
          {
            ethAddress: '0X1234567890123456789012345678901234567890',
            userId: '0X1234567890123456789012345678901234567890',
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
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([fetchedProfile])
      })

      it('should match addresses case-insensitively using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({
          ids: ['0x0987654321098765432109876543210987654321']
        })
        expect(result).toHaveLength(2)
      })
    })

    describe('and no profile IDs are provided', () => {
      it('should return empty array without making any requests', async () => {
        const result = await catalystClient.getProfiles([])

        expect(mockRedis.mGet).not.toHaveBeenCalled()
        expect(lambdasClientMock.getAvatarsDetailsByPost).not.toHaveBeenCalled()
        expect(result).toEqual([])
      })
    })

    describe('and duplicate profile IDs are provided', () => {
      const duplicateProfileIds = [
        '0x1234567890123456789012345678901234567890',
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321'
      ]
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
        mockRedis.mGet.mockResolvedValue([null, null])
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue(mockProfiles)
      })

      it('should deduplicate IDs and return profiles in original order', async () => {
        const result = await catalystClient.getProfiles(duplicateProfileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          getProfileCacheKey('0x1234567890123456789012345678901234567890'),
          getProfileCacheKey('0x0987654321098765432109876543210987654321')
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({
          ids: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']
        })
        expect(result).toHaveLength(2)

        // Expect minimal profiles (without ethAddress)
        expect(result[0]).toEqual({
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
        expect(result[1]).toEqual({
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
        })
      })
    })

    describe('and getProfileUserId throws error in cached profile filter', () => {
      const invalidCachedProfile = {
        avatars: [] // This will cause getProfileUserId to throw
      }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([invalidCachedProfile, null])
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([mockProfile])
      })

      it('should skip invalid cached profiles and fetch from server', async () => {
        const result = await catalystClient.getProfiles([profileIds[0], '0x0987654321098765432109876543210987654321'])

        expect(mockRedis.mGet).toHaveBeenCalled()
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({
          ids: [profileIds[0], '0x0987654321098765432109876543210987654321']
        })
        // The invalid cached profile should be filtered out, but the fetched profile should be returned
        expect(result).toHaveLength(2)
        expect(result).toContainEqual(invalidCachedProfile) // Invalid profile is still returned as-is
        expect(result).toContainEqual(mockProfile) // Fetched profile is also returned
      })
    })

    describe('and batch caching Promise.all fails', () => {
      beforeEach(() => {
        jest.useRealTimers()
        mockRedis.mGet.mockResolvedValue([null])
        // Mock getProfileUserId to throw an error, which will cause the Promise.all to fail
        jest.spyOn(require('../../../src/logic/profiles'), 'getProfileUserId').mockImplementation(() => {
          throw new Error('Batch cache failed')
        })
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([mockProfile])
      })

      afterEach(() => {
        jest.useFakeTimers()
        jest.restoreAllMocks()
      })

      it('should log error for batch failure', async () => {
        const logger = mockLogs.getLogger('catalyst-client')
        const result = await catalystClient.getProfiles([profileIds[0]])

        // Wait for setImmediate to complete
        await new Promise((resolve) => setImmediate(resolve))

        expect(logger.error).toHaveBeenCalledWith(
          'Profile caching batch failed',
          expect.objectContaining({
            error: 'Batch cache failed'
          })
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(mockProfile)
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
        lambdasClientMock.getAvatarDetails = jest.fn().mockResolvedValue(mockProfile)
      })

      it('should fetch profile from catalyst server', async () => {
        const result = await catalystClient.getProfile(profileId)

        expect(mockRedis.get).toHaveBeenCalledWith(getProfileCacheKey(profileId))
        expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledWith(profileId)
        expect(result).toEqual(mockProfile)
      })

      it('should cache the fetched profile with correct expiration', async () => {
        await catalystClient.getProfile(profileId)

        jest.runOnlyPendingTimers()

        expect(mockRedis.put).toHaveBeenCalledWith(getProfileCacheKey(profileId), mockProfile, { EX: 60 * 10 })
      })

      describe('and Redis put fails', () => {
        beforeEach(() => {
          jest.useRealTimers()
          mockRedis.put.mockRejectedValue(new Error('Redis connection failed'))
        })

        afterEach(() => {
          jest.useFakeTimers()
        })

        it('should log warning but not throw error', async () => {
          const logger = mockLogs.getLogger('catalyst-client')
          const result = await catalystClient.getProfile(profileId)

          // Wait for setImmediate to complete
          await new Promise((resolve) => setImmediate(resolve))

          expect(mockRedis.put).toHaveBeenCalled()
          expect(logger.warn).toHaveBeenCalledWith(
            'Failed to cache profile',
            expect.objectContaining({
              error: 'Redis connection failed',
              profileId
            })
          )
          expect(result).toEqual(mockProfile)
        })
      })

      describe('and extractMinimalProfile returns null', () => {
        const invalidProfile = {
          avatars: [] // This will cause extractMinimalProfile to return null
        }

        beforeEach(() => {
          lambdasClientMock.getAvatarDetails = jest.fn().mockResolvedValue(invalidProfile)
        })

        it('should log warning and return original profile without caching', async () => {
          const logger = mockLogs.getLogger('catalyst-client')
          const result = await catalystClient.getProfile(profileId)

          expect(logger.warn).toHaveBeenCalledWith(
            'Invalid profile received from Catalyst, not caching: {"avatars":[]}'
          )
          expect(mockRedis.put).not.toHaveBeenCalled()
          expect(result).toEqual(invalidProfile)
        })
      })

      describe('and the catalyst server fails', () => {
        beforeEach(() => {
          lambdasClientMock.getAvatarDetails = jest
            .fn()
            .mockRejectedValueOnce(new Error('Server error'))
            .mockResolvedValueOnce(mockProfile)
        })

        it('should retry the request', async () => {
          const result = await catalystClient.getProfile(profileId)

          expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledTimes(2)
          expect(result).toEqual(mockProfile)
        })
      })

      describe('and the profile is not found', () => {
        beforeEach(() => {
          lambdasClientMock.getAvatarDetails = jest.fn().mockRejectedValue(new Error('Profile not found'))
        })

        it('should throw an error', async () => {
          await expect(catalystClient.getProfile(profileId)).rejects.toThrow('Profile not found')
        })
      })
    })

    describe('and the profile is cached', () => {
      const cachedProfile = { avatars: [{ ethAddress: profileId, userId: profileId }] }

      beforeEach(() => {
        mockRedis.get.mockResolvedValue(cachedProfile)
      })

      it('should return cached profile without fetching from server', async () => {
        const result = await catalystClient.getProfile(profileId)

        expect(lambdasClientMock.getAvatarDetails).not.toHaveBeenCalled()
        expect(result).toEqual(cachedProfile)
      })
    })
  })

  describe('when getting owned names', () => {
    const address = '0x1234567890123456789012345678901234567890'
    const mockNamesResponse = {
      elements: [
        { tokenId: '1', name: 'test.dcl.eth', contractAddress: '0xcontract' },
        { tokenId: '2', name: 'example.dcl.eth', contractAddress: '0xcontract' }
      ]
    }

    beforeEach(() => {
      lambdasClientMock.getNames = jest.fn().mockResolvedValue(mockNamesResponse)
    })

    describe('and the request succeeds', () => {
      it('should return formatted owned names', async () => {
        const result = await catalystClient.getOwnedNames(address)

        expect(lambdasClientMock.getNames).toHaveBeenCalledWith(address, undefined)
        expect(result).toEqual([
          {
            id: '1',
            name: 'test.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '1'
          },
          {
            id: '2',
            name: 'example.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '2'
          }
        ])
      })

      it('should pass optional parameters to the server', async () => {
        const params: GetNamesParams = { pageSize: '10', pageNum: '0' }
        await catalystClient.getOwnedNames(address, params)

        expect(lambdasClientMock.getNames).toHaveBeenCalledWith(address, params)
      })
    })

    describe('and the catalyst server fails', () => {
      beforeEach(() => {
        lambdasClientMock.getNames = jest
          .fn()
          .mockRejectedValueOnce(new Error('Server error'))
          .mockResolvedValueOnce(mockNamesResponse)
      })

      it('should retry the request', async () => {
        const result = await catalystClient.getOwnedNames(address)

        expect(lambdasClientMock.getNames).toHaveBeenCalledTimes(2)
        expect(result).toEqual([
          {
            id: '1',
            name: 'test.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '1'
          },
          {
            id: '2',
            name: 'example.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '2'
          }
        ])
      })
    })
  })
})

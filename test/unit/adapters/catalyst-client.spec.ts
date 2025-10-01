import { createCatalystClient } from '../../../src/adapters/catalyst-client'
import { ICatalystClientComponent } from '../../../src/types'
import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { mockConfig, mockFetcher, mockRedis } from '../../mocks/components'
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

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(CATALYST_LAMBDAS_LOAD_BALANCER_URL)
    mockConfig.getString.mockResolvedValue('test') // ENV

    catalystClient = await createCatalystClient({
      fetcher: mockFetcher,
      config: mockConfig,
      redis: mockRedis
    })
    lambdasClientMock = createLambdasClient({ fetcher: mockFetcher, url: CATALYST_LAMBDAS_LOAD_BALANCER_URL })
  })

  describe('when getting profiles', () => {
    const profileIds = ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']
    const mockProfiles: Profile[] = [
      {
        avatars: [{ ethAddress: '0x1234567890123456789012345678901234567890', userId: '0x1234567890123456789012345678901234567890' }]
      },
      {
        avatars: [{ ethAddress: '0x0987654321098765432109876543210987654321', userId: '0x0987654321098765432109876543210987654321' }]
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
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          'catalyst:profile:0x0987654321098765432109876543210987654321'
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: profileIds })
        expect(result).toEqual(mockProfiles)
      })

      it('should cache fetched profiles with correct expiration', async () => {
        await catalystClient.getProfiles(profileIds)

        expect(mockRedis.put).toHaveBeenCalledTimes(2)
        expect(mockRedis.put).toHaveBeenCalledWith(
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          JSON.stringify(mockProfiles[0]),
          { EX: 60 * 10 }
        )
        expect(mockRedis.put).toHaveBeenCalledWith(
          'catalyst:profile:0x0987654321098765432109876543210987654321',
          JSON.stringify(mockProfiles[1]),
          { EX: 60 * 10 }
        )
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
          expect(result).toEqual(mockProfiles)
        })
      })
    })

    describe('and some profiles are cached', () => {
      const cachedProfile = { avatars: [{ ethAddress: '0x1234567890123456789012345678901234567890', userId: '0x1234567890123456789012345678901234567890' }] }
      const fetchedProfile = { avatars: [{ ethAddress: '0x0987654321098765432109876543210987654321', userId: '0x0987654321098765432109876543210987654321' }] }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([JSON.stringify(cachedProfile), null])
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([fetchedProfile])
      })

      it('should return cached profiles and fetch missing ones using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          'catalyst:profile:0x0987654321098765432109876543210987654321'
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({ 
          ids: ['0x0987654321098765432109876543210987654321'] 
        })
        expect(result).toHaveLength(2)
        expect(result).toEqual(expect.arrayContaining([cachedProfile, fetchedProfile]))
      })

      it('should cache only the newly fetched profiles', async () => {
        await catalystClient.getProfiles(profileIds)

        expect(mockRedis.put).toHaveBeenCalledTimes(1)
        expect(mockRedis.put).toHaveBeenCalledWith(
          'catalyst:profile:0x0987654321098765432109876543210987654321',
          JSON.stringify(fetchedProfile),
          { EX: 60 * 10 }
        )
      })
    })

    describe('and all profiles are cached', () => {
      const cachedProfile1 = { avatars: [{ ethAddress: '0x1234567890123456789012345678901234567890', userId: '0x1234567890123456789012345678901234567890' }] }
      const cachedProfile2 = { avatars: [{ ethAddress: '0x0987654321098765432109876543210987654321', userId: '0x0987654321098765432109876543210987654321' }] }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([JSON.stringify(cachedProfile1), JSON.stringify(cachedProfile2)])
      })

      it('should return all cached profiles without fetching from server using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          'catalyst:profile:0x0987654321098765432109876543210987654321'
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).not.toHaveBeenCalled()
        expect(result).toEqual([cachedProfile1, cachedProfile2])
      })
    })

    describe('and case-insensitive address matching is needed', () => {
      const cachedProfile = { avatars: [{ ethAddress: '0X1234567890123456789012345678901234567890', userId: '0X1234567890123456789012345678901234567890' }] }
      const fetchedProfile = { avatars: [{ ethAddress: '0x0987654321098765432109876543210987654321', userId: '0x0987654321098765432109876543210987654321' }] }

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([JSON.stringify(cachedProfile), null])
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue([fetchedProfile])
      })

      it('should match addresses case-insensitively using mGet', async () => {
        const result = await catalystClient.getProfiles(profileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          'catalyst:profile:0x0987654321098765432109876543210987654321'
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
      const duplicateProfileIds = ['0x1234567890123456789012345678901234567890', '0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']
      const mockProfiles: Profile[] = [
        {
          avatars: [{ ethAddress: '0x1234567890123456789012345678901234567890', userId: '0x1234567890123456789012345678901234567890' }]
        },
        {
          avatars: [{ ethAddress: '0x0987654321098765432109876543210987654321', userId: '0x0987654321098765432109876543210987654321' }]
        }
      ]

      beforeEach(() => {
        mockRedis.mGet.mockResolvedValue([null, null])
        lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue(mockProfiles)
      })

      it('should deduplicate IDs and return profiles in original order', async () => {
        const result = await catalystClient.getProfiles(duplicateProfileIds)

        expect(mockRedis.mGet).toHaveBeenCalledWith([
          'catalyst:profile:0x1234567890123456789012345678901234567890',
          'catalyst:profile:0x0987654321098765432109876543210987654321'
        ])
        expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledWith({ 
          ids: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321'] 
        })
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual(mockProfiles[0])
        expect(result[1]).toEqual(mockProfiles[1])
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

        expect(mockRedis.get).toHaveBeenCalledWith(`catalyst:profile:${profileId}`)
        expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledWith(profileId)
        expect(result).toEqual(mockProfile)
      })

      it('should cache the fetched profile with correct expiration', async () => {
        await catalystClient.getProfile(profileId)

        expect(mockRedis.put).toHaveBeenCalledWith(
          `catalyst:profile:${profileId}`,
          JSON.stringify(mockProfile),
          { EX: 60 * 10 }
        )
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
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedProfile))
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
import { createCatalystClient } from '../../../src/adapters/catalyst-client'
import { ICatalystClientComponent } from '../../../src/types'
import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { mockConfig, mockFetcher, mockLogs } from '../../mocks/components'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { mockProfile } from '../../mocks/profile'

jest.mock('dcl-catalyst-client', () => ({
  ...jest.requireActual('dcl-catalyst-client'),
  createLambdasClient: jest.fn().mockReturnValue({
    getAvatarsDetailsByPost: jest.fn(),
    getAvatarDetails: jest.fn()
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

describe('Catalyst client', () => {
  let catalystClient: ICatalystClientComponent
  let lambdasClientMock: LambdasClient

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(CATALYST_LAMBDAS_LOAD_BALANCER_URL)

    catalystClient = await createCatalystClient({
      fetcher: mockFetcher,
      config: mockConfig,
      logs: mockLogs
    })
    lambdasClientMock = createLambdasClient({ fetcher: mockFetcher, url: CATALYST_LAMBDAS_LOAD_BALANCER_URL })
  })

  describe('getProfiles', () => {
    let ids: string[]
    let profiles: Profile[]
    let customLambdasServer: string

    beforeEach(() => {
      ids = ['id1', 'id2']
      profiles = [
        {
          avatars: [{ userId: 'id1' }]
        },
        {
          avatars: [{ userId: 'id2' }]
        }
      ]
      customLambdasServer = 'http://custom-content-server.com/lambdas'
    })

    it('should fetch profiles with retries and default values', async () => {
      lambdasClientMock.getAvatarsDetailsByPost = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockResolvedValueOnce(profiles)

      const result = await catalystClient.getProfiles(ids)

      expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledTimes(2)
      expect(result).toEqual(profiles)
    })

    it('should fetch profiles with custom retries and wait time', async () => {
      lambdasClientMock.getAvatarsDetailsByPost = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce(profiles)

      const result = await catalystClient.getProfiles(ids, { retries: 5, waitTime: 500 })

      expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledTimes(2)
      expect(result).toEqual(profiles)
    })

    it('should fetch profiles from custom content server on the first attempt', async () => {
      lambdasClientMock.getAvatarsDetailsByPost = jest.fn().mockResolvedValue(profiles)

      const result = await catalystClient.getProfiles(ids, { lambdasServerUrl: customLambdasServer })

      expectLambdasClientToHaveBeenCalledWithUrl(customLambdasServer)
      expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledTimes(1)

      expect(result).toEqual(profiles)
    })

    it('should rotate among catalyst server URLs on subsequent attempts', async () => {
      lambdasClientMock.getAvatarsDetailsByPost = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockResolvedValueOnce(profiles)

      await catalystClient.getProfiles(ids)

      expectLambdasClientToHaveBeenCalledWithUrl(CATALYST_LAMBDAS_LOAD_BALANCER_URL)
      expectLambdasClientToHaveBeenCalledWithUrl('http://catalyst-server-3.com/lambdas')
      expectLambdasClientToHaveBeenCalledWithUrl('http://catalyst-server-2.com/lambdas')

      expect(lambdasClientMock.getAvatarsDetailsByPost).toHaveBeenCalledTimes(3)
    })

    it('should not reuse the same catalyst server URL on different attempts', async () => {
      lambdasClientMock.getAvatarsDetailsByPost = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockRejectedValueOnce(new Error('Failure on third attempt'))

      await catalystClient.getProfiles(ids, { retries: 3 }).catch(() => {})

      const createLambdasClientMock = createLambdasClient as jest.Mock
      const currentCalls = createLambdasClientMock.mock.calls.slice(1) // Avoid the first call which is the one made in the beforeEach

      const urlsUsed = currentCalls.map((args) => args[0].url)
      const uniqueUrls = new Set(urlsUsed)

      expect(uniqueUrls.size).toBe(urlsUsed.length)
    })
  })

  describe('getProfile', () => {
    let customLambdasServer: string

    beforeEach(() => {
      customLambdasServer = 'http://custom-content-server.com/lambdas'
    })

    it('should throw an error if the profile is not found', async () => {
      lambdasClientMock.getAvatarDetails = jest.fn().mockRejectedValue(new Error('Profile not found'))
      await expect(catalystClient.getProfile('id')).rejects.toThrow('Profile not found')
    })

    it('should return the profile if it is found', async () => {
      lambdasClientMock.getAvatarDetails = jest.fn().mockResolvedValue(mockProfile)

      const result = await catalystClient.getProfile('id')

      expect(result).toEqual(mockProfile)
    })

    it('should fetch profile with retries and default values', async () => {
      lambdasClientMock.getAvatarDetails = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockResolvedValueOnce(mockProfile)

      const result = await catalystClient.getProfile('id')

      expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledTimes(2)
      expect(result).toEqual(mockProfile)
    })

    it('should fetch profile with custom retries and wait time', async () => {
      lambdasClientMock.getAvatarDetails = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce(mockProfile)

      const result = await catalystClient.getProfile('id', { retries: 5, waitTime: 500 })

      expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledTimes(2)
      expect(result).toEqual(mockProfile)
    })

    it('should fetch profile from custom content server on the first attempt', async () => {
      lambdasClientMock.getAvatarDetails = jest.fn().mockResolvedValue(mockProfile)

      const result = await catalystClient.getProfile('id', { lambdasServerUrl: customLambdasServer })

      expectLambdasClientToHaveBeenCalledWithUrl(customLambdasServer)
      expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockProfile)
    })

    it('should rotate among catalyst server URLs on subsequent attempts', async () => {
      lambdasClientMock.getAvatarDetails = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockResolvedValueOnce(mockProfile)

      await catalystClient.getProfile('id')

      expectLambdasClientToHaveBeenCalledWithUrl(CATALYST_LAMBDAS_LOAD_BALANCER_URL)
      expectLambdasClientToHaveBeenCalledWithUrl('http://catalyst-server-3.com/lambdas')
      expectLambdasClientToHaveBeenCalledWithUrl('http://catalyst-server-2.com/lambdas')

      expect(lambdasClientMock.getAvatarDetails).toHaveBeenCalledTimes(3)
    })

    it('should not reuse the same catalyst server URL on different attempts', async () => {
      lambdasClientMock.getAvatarDetails = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockRejectedValueOnce(new Error('Failure on third attempt'))

      await catalystClient.getProfile('id', { retries: 3 }).catch(() => {})

      const createLambdasClientMock = createLambdasClient as jest.Mock
      const currentCalls = createLambdasClientMock.mock.calls.slice(1) // Avoid the first call which is the one made in the beforeEach

      const urlsUsed = currentCalls.map((args) => args[0].url)
      const uniqueUrls = new Set(urlsUsed)

      expect(uniqueUrls.size).toBe(urlsUsed.length)
    })
  })

  // Helpers
  function expectLambdasClientToHaveBeenCalledWithUrl(url: string) {
    expect(createLambdasClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url
      })
    )
  }
})

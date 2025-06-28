import { createRewardComponent } from '../../../src/adapters/rewards'
import { IRewardComponent } from '../../../src/types'
import { mockConfig, mockFetcher } from '../../mocks/components'
import {
  createMockRewardData,
  createMockRewardSuccessResponse,
  createMockRewardEmptyResponse,
  createMockRewardBadRequestResponse,
  createMockRewardNetworkError,
  createMockRewardTextReadError,
  mockRewardTestData
} from '../../mocks/rewards'

describe('RewardComponent', () => {
  let rewardComponent: IRewardComponent
  let mockRewardUrl: string

  beforeEach(async () => {
    mockRewardUrl = mockRewardTestData.rewardUrl
    mockConfig.requireString.mockResolvedValue(mockRewardUrl)

    rewardComponent = createRewardComponent({
      fetcher: mockFetcher,
      config: mockConfig
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when sending a reward', () => {
    let campaignKey: string
    let beneficiary: string
    let requestBody: { campaign_key: string; beneficiary: string }

    beforeEach(() => {
      campaignKey = mockRewardTestData.campaignKey
      beneficiary = mockRewardTestData.beneficiary
      requestBody = mockRewardTestData.requestBody
    })

    describe('with valid data and reward available', () => {
      beforeEach(() => {
        const mockRewardData = createMockRewardData()
        mockFetcher.fetch.mockResolvedValue(createMockRewardSuccessResponse([mockRewardData]))
      })

      it('should send reward successfully and return API response', async () => {
        const result = await rewardComponent.sendReward(campaignKey, beneficiary)

        expect(mockConfig.requireString).toHaveBeenCalledWith('REWARD_SERVER_URL')
        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${mockRewardUrl}/rewards`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        expect(result.ok).toBe(true)
        expect(result.data).toHaveLength(1)

        const rewardData = result.data[0]
        expect(rewardData).toMatchObject({
          id: '550e8400-e29b-41d4-a716-446655440000',
          user: '0x1234567890123456789012345678901234567890',
          status: 'assigned',
          chain_id: 137,
          target: '0x7434a847c5e1ff250db456c55f99d1612e93d6a3',
          value: '0',
          token: 'Polygon sunglasses',
          image:
            'https://peer.decentraland.zone/lambdas/collections/contents/urn:decentraland:mumbai:collections-v2:0x7434a847c5e1ff250db456c55f99d1612e93d6a3:0/thumbnail',
          rarity: 'common'
        })
      })
    })

    describe('with valid data but no stock available', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue(createMockRewardEmptyResponse())
      })

      it('should send reward successfully but return empty data array', async () => {
        const result = await rewardComponent.sendReward(campaignKey, beneficiary)

        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          `${mockRewardUrl}/rewards`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(requestBody)
          })
        )
        expect(result).toEqual({
          ok: true,
          data: []
        })
      })
    })

    describe('when the reward server URL ends with slash', () => {
      beforeEach(() => {
        mockConfig.requireString.mockResolvedValue(mockRewardTestData.rewardUrlWithSlash)
        mockFetcher.fetch.mockResolvedValue(createMockRewardEmptyResponse())

        rewardComponent = createRewardComponent({
          fetcher: mockFetcher,
          config: mockConfig
        })
      })

      it('should handle URL with trailing slash correctly', async () => {
        await rewardComponent.sendReward(campaignKey, beneficiary)

        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          'https://rewards.decentraland.org/api/rewards',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(requestBody)
          })
        )
      })
    })

    describe('when the reward server URL does not end with slash', () => {
      beforeEach(() => {
        mockConfig.requireString.mockResolvedValue(mockRewardTestData.rewardUrl)
        mockFetcher.fetch.mockResolvedValue(createMockRewardEmptyResponse())

        rewardComponent = createRewardComponent({
          fetcher: mockFetcher,
          config: mockConfig
        })
      })

      it('should add slash to URL correctly', async () => {
        await rewardComponent.sendReward(campaignKey, beneficiary)

        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          'https://rewards.decentraland.org/api/rewards',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(requestBody)
          })
        )
      })
    })

    describe('when the API returns a bad request error', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue(createMockRewardBadRequestResponse())
      })

      it('should throw an error with response details', async () => {
        await expect(rewardComponent.sendReward(campaignKey, beneficiary)).rejects.toThrow(
          'Failed to fetch https://rewards.decentraland.org/api/rewards: 400 {"ok":false,"code":"bad_request","error":"Invalid data was sent to the server"}'
        )
      })
    })

    describe('when the fetch fails with network error', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockRejectedValue(createMockRewardNetworkError())
      })

      it('should throw the network error', async () => {
        await expect(rewardComponent.sendReward(campaignKey, beneficiary)).rejects.toThrow('Network error')
      })
    })

    describe('when the response text cannot be read', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue(createMockRewardTextReadError())
      })

      it('should throw the text reading error', async () => {
        await expect(rewardComponent.sendReward(campaignKey, beneficiary)).rejects.toThrow('Cannot read response')
      })
    })
  })
})

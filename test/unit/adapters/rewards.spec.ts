import { createRewardComponent, isDefinitiveNonIssuance, RewardIssuanceError } from '../../../src/adapters/rewards'
import { ChainId, Rarity } from '@dcl/schemas'
import { RewardAttributes, RewardStatus } from '../../../src/logic/referral/types'
import { IRewardComponent } from '../../../src/types'
import { mockConfig, mockFetcher, createLogsMockedComponent } from '../../mocks/components'

const mockRewardData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user: '0x1234567890123456789012345678901234567890',
  status: RewardStatus.assigned,
  chain_id: ChainId.MATIC_MAINNET,
  target: '0x7434a847c5e1ff250db456c55f99d1612e93d6a3',
  value: '0',
  token: 'Polygon sunglasses',
  image:
    'https://peer.decentraland.zone/lambdas/collections/contents/urn:decentraland:mumbai:collections-v2:0x7434a847c5e1ff250db456c55f99d1612e93d6a3:0/thumbnail',
  rarity: Rarity.COMMON
} as RewardAttributes

const createMockRewardEmptyResponse = () =>
  ({
    ok: true,
    status: 201,
    json: jest.fn().mockResolvedValue({ ok: true, data: [] }),
    text: jest.fn().mockResolvedValue('')
  }) as any

const mockRewardTestData = {
  campaignKey: 'test-campaign-123',
  beneficiary: '0x1234567890123456789012345678901234567890',
  requestBody: {
    campaign_key: 'test-campaign-123',
    beneficiary: '0x1234567890123456789012345678901234567890'
  },
  rewardUrl: 'https://rewards.decentraland.org/api',
  rewardUrlWithSlash: 'https://rewards.decentraland.org/api/'
}

describe('RewardComponent', () => {
  let rewardComponent: IRewardComponent
  let mockRewardUrl: string
  let mockWarn: jest.Mock

  beforeEach(async () => {
    mockRewardUrl = mockRewardTestData.rewardUrl
    mockConfig.requireString.mockResolvedValue(mockRewardUrl)
    mockWarn = jest.fn()

    rewardComponent = await createRewardComponent({
      fetcher: mockFetcher,
      config: mockConfig,
      logs: createLogsMockedComponent({ warn: mockWarn })
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
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ ok: true, data: [mockRewardData] }),
          text: jest.fn().mockResolvedValue('')
        } as any)
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
          body: JSON.stringify(requestBody),
          abortController: expect.any(AbortController)
        })

        expect(result).toHaveLength(1)

        const rewardData = result[0]
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

    describe('and the response is ok but no stock is available', () => {
      let caughtError: unknown

      beforeEach(async () => {
        caughtError = undefined
        mockFetcher.fetch.mockResolvedValue(createMockRewardEmptyResponse())

        try {
          await rewardComponent.sendReward(campaignKey, beneficiary)
        } catch (error) {
          caughtError = error
        }
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should still have posted the campaign key and beneficiary to the reward server', () => {
        expect(mockFetcher.fetch).toHaveBeenCalledWith(
          `${mockRewardUrl}/rewards`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(requestBody)
          })
        )
      })

      it('should throw a RewardIssuanceError naming the empty reward list rather than returning an empty array', () => {
        expect(caughtError).toMatchObject({
          name: 'RewardIssuanceError',
          message: 'Reward server issued no usable reward: response contained an empty reward list'
        })
      })

      it('should log a warning identifying the beneficiary that received nothing', () => {
        expect(mockWarn).toHaveBeenCalledWith('Reward server returned an empty reward list', { beneficiary })
      })

      it('should classify it as a definitive non-issuance so the tier stays retryable', () => {
        expect(isDefinitiveNonIssuance(caughtError)).toBe(true)
      })
    })

    describe('and the response is ok but the data field is missing', () => {
      let caughtError: unknown

      beforeEach(async () => {
        caughtError = undefined
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ ok: true }),
          text: jest.fn().mockResolvedValue('')
        } as any)

        try {
          await rewardComponent.sendReward(campaignKey, beneficiary)
        } catch (error) {
          caughtError = error
        }
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should throw a RewardIssuanceError naming the missing data array', () => {
        expect(caughtError).toMatchObject({
          name: 'RewardIssuanceError',
          message: 'Reward server issued no usable reward: response contained no data array'
        })
      })

      it('should log a warning identifying the beneficiary that received nothing', () => {
        expect(mockWarn).toHaveBeenCalledWith('Reward server response did not contain a data array', { beneficiary })
      })
    })

    describe('and the response is ok but a returned reward has no image', () => {
      let caughtError: unknown

      beforeEach(async () => {
        caughtError = undefined
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ ok: true, data: [{ ...mockRewardData, image: undefined }] }),
          text: jest.fn().mockResolvedValue('')
        } as any)

        try {
          await rewardComponent.sendReward(campaignKey, beneficiary)
        } catch (error) {
          caughtError = error
        }
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should throw a RewardIssuanceError rather than hand the caller a reward it will dereference', () => {
        expect(caughtError).toMatchObject({
          name: 'RewardIssuanceError',
          message: 'Reward server issued no usable reward: a returned reward is missing its image'
        })
      })
    })

    describe('and the reward server refuses the request with a 4xx', () => {
      let caughtError: unknown

      beforeEach(async () => {
        mockFetcher.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: jest.fn().mockResolvedValue(
            JSON.stringify({
              ok: false,
              code: 'bad_request',
              error: 'Invalid data was sent to the server'
            })
          )
        } as any)

        caughtError = await rewardComponent.sendReward(campaignKey, beneficiary).catch((error) => error)
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should throw a RewardRequestFailedError carrying the status and not the upstream response body', () => {
        expect(caughtError).toMatchObject({
          name: 'RewardRequestFailedError',
          status: 400,
          message: 'Failed to fetch https://rewards.decentraland.org/api/rewards: 400'
        })
      })

      it('should classify it as a definitive non-issuance, since the server refused before creating anything', () => {
        expect(isDefinitiveNonIssuance(caughtError)).toBe(true)
      })
    })

    describe('and the reward server answers with a 5xx', () => {
      let responseTextMock: jest.Mock
      let caughtError: unknown

      beforeEach(async () => {
        responseTextMock = jest.fn().mockRejectedValue(new Error('Cannot read response'))
        mockFetcher.fetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: responseTextMock
        } as any)

        caughtError = await rewardComponent.sendReward(campaignKey, beneficiary).catch((error) => error)
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should throw a stable error that does not depend on the response body', () => {
        expect(caughtError).toMatchObject({
          name: 'RewardRequestFailedError',
          status: 500,
          message: 'Failed to fetch https://rewards.decentraland.org/api/rewards: 500'
        })
      })

      it('should not read a potentially secret-bearing response body', () => {
        expect(responseTextMock).not.toHaveBeenCalled()
      })

      it('should not classify it as a definitive non-issuance, since the reward can be created before the handler fails', () => {
        expect(isDefinitiveNonIssuance(caughtError)).toBe(false)
      })
    })

    describe('and the request never completed', () => {
      let caughtError: unknown

      beforeEach(async () => {
        mockFetcher.fetch.mockRejectedValue(new Error('Network error'))
        caughtError = await rewardComponent.sendReward(campaignKey, beneficiary).catch((error) => error)
      })

      afterEach(() => {
        caughtError = undefined
      })

      it('should propagate the transport error untouched', () => {
        expect(caughtError).toMatchObject({ message: 'Network error' })
      })

      it('should not classify it as a definitive non-issuance, since the request may have reached the server', () => {
        expect(isDefinitiveNonIssuance(caughtError)).toBe(false)
      })
    })
  })

  describe('when the reward server answers but then stalls the response body', () => {
    let campaignKey: string
    let beneficiary: string
    let caughtError: unknown
    let stallingComponent: IRewardComponent

    beforeEach(async () => {
      campaignKey = mockRewardTestData.campaignKey
      beneficiary = mockRewardTestData.beneficiary
      mockConfig.requireString.mockResolvedValue(mockRewardTestData.rewardUrl)
      mockConfig.getNumber.mockResolvedValue(10)

      // The fetcher's timeout stops at the headers, so only the component's own controller can
      // end a body that never arrives.
      mockFetcher.fetch.mockImplementation(
        async (_url, init) =>
          ({
            ok: true,
            status: 201,
            json: () =>
              new Promise((_resolve, reject) => {
                init?.abortController?.signal.addEventListener('abort', () =>
                  reject(new Error('The operation was aborted'))
                )
              })
          }) as any
      )

      stallingComponent = await createRewardComponent({
        fetcher: mockFetcher,
        config: mockConfig,
        logs: createLogsMockedComponent({ warn: jest.fn() })
      })

      caughtError = await stallingComponent.sendReward(campaignKey, beneficiary).catch((error) => error)
    })

    afterEach(() => {
      caughtError = undefined
    })

    it('should read the request timeout from configuration', () => {
      expect(mockConfig.getNumber).toHaveBeenCalledWith('REWARD_REQUEST_TIMEOUT_MS')
    })

    it('should abort the stalled body read instead of hanging past the timeout', () => {
      expect(caughtError).toMatchObject({ message: 'The operation was aborted' })
    })

    it('should not classify the abort as a definitive non-issuance, since the reward may exist', () => {
      expect(isDefinitiveNonIssuance(caughtError)).toBe(false)
    })

    it('should expose the configured bound so a caller can size its claim lease against it', () => {
      expect(stallingComponent.requestTimeoutMs).toBe(10)
    })
  })

  describe('when no reward request timeout is configured', () => {
    let defaultComponent: IRewardComponent

    beforeEach(async () => {
      mockConfig.requireString.mockResolvedValue(mockRewardTestData.rewardUrl)
      mockConfig.getNumber.mockResolvedValue(undefined)

      defaultComponent = await createRewardComponent({
        fetcher: mockFetcher,
        config: mockConfig,
        logs: createLogsMockedComponent({ warn: jest.fn() })
      })
    })

    it('should still expose a bound, so a caller can never size a claim lease against an unbounded call', () => {
      expect(defaultComponent.requestTimeoutMs).toBe(30_000)
    })
  })

  describe('when classifying a failure the reward server produced', () => {
    describe('and the fetcher timed the request out', () => {
      let timeoutError: Error

      beforeEach(() => {
        // The exact error @dcl/fetch-component throws once its timeout aborts the request.
        timeoutError = new Error('Request aborted (timed out)')
      })

      it('should not treat it as a definitive non-issuance', () => {
        expect(isDefinitiveNonIssuance(timeoutError)).toBe(false)
      })
    })

    describe('and undici rejected the request at the network level', () => {
      let networkError: Error

      beforeEach(() => {
        networkError = new TypeError('fetch failed')
      })

      it('should not treat it as a definitive non-issuance', () => {
        expect(isDefinitiveNonIssuance(networkError)).toBe(false)
      })
    })

    describe('and the response arrived but carried no usable reward', () => {
      let issuanceError: RewardIssuanceError

      beforeEach(() => {
        issuanceError = new RewardIssuanceError('response contained an empty reward list')
      })

      it('should treat it as a definitive non-issuance', () => {
        expect(isDefinitiveNonIssuance(issuanceError)).toBe(true)
      })
    })

    describe('and the failure is of an unforeseen kind', () => {
      let unexpectedError: Error

      beforeEach(() => {
        unexpectedError = new Error('something nobody anticipated')
      })

      it('should default to not definitive, so an unknown outcome is never blindly retried', () => {
        expect(isDefinitiveNonIssuance(unexpectedError)).toBe(false)
      })
    })
  })
})

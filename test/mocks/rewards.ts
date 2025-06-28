import { RewardAttributes, RewardStatus } from '../../src/logic/referral/types'
import { ChainId, Rarity } from '@dcl/schemas'

export const createMockRewardData = (overrides: Partial<RewardAttributes> = {}): RewardAttributes => {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    user: '0x1234567890123456789012345678901234567890',
    status: RewardStatus.assigned,
    chain_id: ChainId.MATIC_MAINNET,
    target: '0x7434a847c5e1ff250db456c55f99d1612e93d6a3',
    value: '0',
    token: 'Polygon sunglasses',
    image:
      'https://peer.decentraland.zone/lambdas/collections/contents/urn:decentraland:mumbai:collections-v2:0x7434a847c5e1ff250db456c55f99d1612e93d6a3:0/thumbnail',
    rarity: Rarity.COMMON,
    ...overrides
  }
}

export const createMockRewardSuccessResponse = (data: RewardAttributes[] = []) =>
  ({
    ok: true,
    status: 201,
    json: jest.fn().mockResolvedValue({ ok: true, data }),
    text: jest.fn().mockResolvedValue('')
  }) as any

export const createMockRewardEmptyResponse = () =>
  ({
    ok: true,
    status: 201,
    json: jest.fn().mockResolvedValue({ ok: true, data: [] }),
    text: jest.fn().mockResolvedValue('')
  }) as any

export const createMockRewardBadRequestResponse = () =>
  ({
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
  }) as any

export const createMockRewardServerErrorResponse = () =>
  ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: jest.fn().mockResolvedValue(
      JSON.stringify({
        ok: false,
        code: 'internal_server_error',
        error: 'Internal server error'
      })
    )
  }) as any

export const createMockRewardNetworkError = (): Error => new Error('Network error')

export const createMockRewardTextReadError = () =>
  ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: jest.fn().mockRejectedValue(new Error('Cannot read response'))
  }) as any

export const mockRewardTestData = {
  campaignKey: 'test-campaign-123',
  beneficiary: '0x1234567890123456789012345678901234567890',
  requestBody: {
    campaign_key: 'test-campaign-123',
    beneficiary: '0x1234567890123456789012345678901234567890'
  },
  rewardUrl: 'https://rewards.decentraland.org/api',
  rewardUrlWithSlash: 'https://rewards.decentraland.org/api/'
}

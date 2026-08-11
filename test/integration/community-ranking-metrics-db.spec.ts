import { v4 as uuidv4 } from 'uuid'
import { test } from '../components'
import { createCommunity } from './utils/communities'
import { mockCommunity } from '../mocks/communities'

const MAX_INT4 = 2147483647

test('Community Ranking Metrics', function ({ components }) {
  let communityId: string

  beforeEach(async () => {
    const community = await createCommunity(
      components.communitiesDb,
      mockCommunity({ name: `Ranking ${uuidv4()}`, owner_address: '0x0000000000000000000000000000000000000001' })
    )
    communityId = community
  })

  afterEach(async () => {
    await components.communitiesDbHelper.forceCommunityRemoval(communityId)
  })

  describe('when the counter is already close to the top of the column', () => {
    let stored: number | undefined

    beforeEach(async () => {
      // The shape a forged event left behind before contributions were clamped.
      await components.communitiesDbHelper.forceRankingMetricValue(communityId, 'events_count', MAX_INT4 - 10)

      await components.communitiesDb.updateCommunityRankingMetrics(communityId, { events_count: 50 })

      stored = await components.communitiesDbHelper.getRankingMetricValue(communityId, 'events_count')
    })

    it('should saturate at the column maximum rather than raising integer out of range', () => {
      expect(stored).toBe(MAX_INT4)
    })
  })

  describe('when the counter is already at the top of the column', () => {
    let stored: number | undefined

    beforeEach(async () => {
      await components.communitiesDbHelper.forceRankingMetricValue(communityId, 'events_count', MAX_INT4)

      await components.communitiesDb.updateCommunityRankingMetrics(communityId, { events_count: 1 })

      stored = await components.communitiesDbHelper.getRankingMetricValue(communityId, 'events_count')
    })

    it('should stay at the maximum and keep accepting writes', () => {
      expect(stored).toBe(MAX_INT4)
    })
  })

  describe('when the counter has room left', () => {
    let stored: number | undefined

    beforeEach(async () => {
      await components.communitiesDbHelper.forceRankingMetricValue(communityId, 'events_count', 5)

      await components.communitiesDb.updateCommunityRankingMetrics(communityId, { events_count: 3 })

      stored = await components.communitiesDbHelper.getRankingMetricValue(communityId, 'events_count')
    })

    it('should accumulate normally', () => {
      expect(stored).toBe(8)
    })
  })
})

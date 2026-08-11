import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { ICommunitiesDatabaseComponent } from '../../../src/types'

describe('when accumulating community ranking metrics', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let query: jest.Mock
  let communityId: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    communitiesDb = createCommunitiesDBComponent({ pg: { query } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the contribution is within the metric ceiling', () => {
    beforeEach(async () => {
      await communitiesDb.updateCommunityRankingMetrics(communityId, {
        events_count: 1,
        events_total_attendees: 42
      })
    })

    it('should record the value unchanged', () => {
      expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining([1, 42]))
    })
  })

  describe('and the contribution exceeds the metric ceiling', () => {
    beforeEach(async () => {
      await communitiesDb.updateCommunityRankingMetrics(communityId, {
        events_total_attendees: 2147483647,
        streams_total_participants: 999999
      })
    })

    it('should clamp attendees to the highest value the score can use', () => {
      expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining([1000]))
    })

    it('should clamp participants to the highest value the score can use', () => {
      expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining([500]))
    })
  })

  describe('and the contribution is negative or not a number', () => {
    beforeEach(async () => {
      await communitiesDb.updateCommunityRankingMetrics(communityId, {
        events_total_attendees: -5,
        photos_count: Number.POSITIVE_INFINITY
      })
    })

    it('should contribute nothing rather than moving the counter backwards', () => {
      expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining([0, 0]))
    })
  })

  describe('and the accumulated total would exceed the column type', () => {
    beforeEach(async () => {
      await communitiesDb.updateCommunityRankingMetrics(communityId, { events_count: 1 })
    })

    it('should widen the column before adding, so the sum cannot overflow before it is clamped', () => {
      expect(query.mock.calls[0][0].text).toContain(
        'events_count = LEAST(community_ranking_metrics.events_count::bigint + '
      )
    })

    it('should widen the contribution too, and narrow only the clamped result', () => {
      expect(query.mock.calls[0][0].text).toContain('::bigint, 2147483647)::integer')
    })

    it('should never add two integers before the clamp', () => {
      // int + int is evaluated before LEAST sees it, so this shape raises 22003 on a column already
      // near the maximum — the exact row the clamp exists to unstick.
      expect(query.mock.calls[0][0].text).not.toContain('community_ranking_metrics.events_count + ')
    })
  })

  describe('and a boolean metric is written', () => {
    beforeEach(async () => {
      await communitiesDb.updateCommunityRankingMetrics(communityId, { has_thumbnail: true })
    })

    it('should assign it rather than accumulate it', () => {
      expect(query.mock.calls[0][0].text).toContain('has_thumbnail = ')
      expect(query.mock.calls[0][0].text).not.toContain('has_thumbnail = LEAST')
    })
  })
})

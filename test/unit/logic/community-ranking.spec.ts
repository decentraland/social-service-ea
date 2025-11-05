import { createCommunityRankingComponent } from '../../../src/logic/community/ranking'
import {
  Community,
  CommunityDB,
  CommunityPrivacyEnum,
  CommunityVisibilityEnum,
  ICommunityRankingComponent
} from '../../../src/logic/community/types'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { createLogsMockedComponent } from '../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { mockCommunity as createMockCommunity } from '../../mocks/communities'

describe('Ranking Component', () => {
  let communityRanking: ICommunityRankingComponent
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunityDB: CommunityDB
  let mockCommunity: Community

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunityDB = createMockCommunity()
    mockCommunity = {
      id: mockCommunityDB.id,
      name: mockCommunityDB.name,
      description: mockCommunityDB.description,
      ownerAddress: mockCommunityDB.owner_address,
      privacy: mockCommunityDB.private ? CommunityPrivacyEnum.Private : CommunityPrivacyEnum.Public,
      visibility: mockCommunityDB.unlisted ? CommunityVisibilityEnum.Unlisted : CommunityVisibilityEnum.All,
      active: mockCommunityDB.active
    }
    communityRanking = createCommunityRankingComponent({
      logs: mockLogs,
      communitiesDb: mockCommunitiesDB
    })
  })

  describe('when calculating ranking scores for all communities', () => {
    let communitiesWithMetrics: Array<{
      communityId: string
      eventsCount: number
      hasThumbnail: number
      photosCount: number
      hasDescription: number
      placesCount: number
      newMembersCount: number
      postsCount: number
      streamsCount: number
      eventsTotalAttendees: number
      streamsTotalParticipants: number
      ageInDays: number
    }>

    beforeEach(() => {
      communitiesWithMetrics = [
        {
          communityId: 'community-1',
          eventsCount: 2,
          hasThumbnail: 1,
          photosCount: 3,
          hasDescription: 1,
          placesCount: 3,
          newMembersCount: 5,
          postsCount: 8,
          streamsCount: 1,
          eventsTotalAttendees: 50,
          streamsTotalParticipants: 25,
          ageInDays: 5 // New community (5 days old) - gets age-based boost of 1.15x (reduced by score)
        },
        {
          communityId: 'community-2',
          eventsCount: 1,
          hasThumbnail: 0,
          photosCount: 0,
          hasDescription: 0,
          placesCount: 1,
          newMembersCount: 2,
          postsCount: 3,
          streamsCount: 0,
          eventsTotalAttendees: 10,
          streamsTotalParticipants: 0,
          ageInDays: 3 // New community (3 days old) - gets age-based boost of 1.15x (reduced by score)
        }
      ]
      mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockImplementation((pagination) => {
        if (pagination?.offset === 0) {
          return Promise.resolve(communitiesWithMetrics)
        }
        return Promise.resolve([])
      })
      mockCommunitiesDB.updateCommunitiesRankingScores.mockResolvedValue()
    })

    describe('and calculation succeeds', () => {
      it('should calculate and update normalized scores (0-1) for all communities with new community boost', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.getAllCommunitiesWithRankingMetrics).toHaveBeenCalledTimes(2)
        expect(mockCommunitiesDB.updateCommunitiesRankingScores).toHaveBeenCalledTimes(1)

        // Verify the Map contains correct normalized scores with boost
        const updateCall = mockCommunitiesDB.updateCommunitiesRankingScores.mock.calls[0][0]
        expect(updateCall).toBeInstanceOf(Map)

        // Verify scores are normalized (0-1 range)
        const score1 = updateCall.get('community-1')
        const score2 = updateCall.get('community-2')
        expect(score1).toBeGreaterThanOrEqual(0)
        expect(score1).toBeLessThanOrEqual(1)
        expect(score2).toBeGreaterThanOrEqual(0)
        expect(score2).toBeLessThanOrEqual(1)

        // community-1 has better metrics, so should have higher score
        expect(score1).toBeGreaterThan(score2)

        // Both are new communities (age 3-5 days), so should get age-based boost of 1.15x
        // Boost is reduced by (normalizedScore * 0.3), so communities with higher scores get less boost
        // community-1 has: thumbnail, description, events, photos, places, new members, posts, streams
        // Approximate normalized score calculation with score-adjusted boost
        expect(score1).toBeGreaterThan(0.3) // Should be reasonably high with boost
      })
    })

    describe('and one community calculation fails', () => {
      beforeEach(() => {
        // Mock will throw, but we continue processing other communities
        // The error is caught in the loop, so we still call updateCommunitiesRankingScores
      })

      it('should continue processing other communities', async () => {
        // Add a community with invalid data that would cause calculation to fail
        communitiesWithMetrics.push({
          communityId: 'community-error',
          eventsCount: NaN,
          hasThumbnail: 0,
          photosCount: 0,
          hasDescription: 0,
          placesCount: 0,
          newMembersCount: 0,
          postsCount: 0,
          streamsCount: 0,
          eventsTotalAttendees: 0,
          streamsTotalParticipants: 0,
          ageInDays: 10
        })
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockImplementation((pagination) => {
          if (pagination?.offset === 0) {
            return Promise.resolve(communitiesWithMetrics)
          }
          return Promise.resolve([])
        })

        await communityRanking.calculateRankingScoreForAllCommunities()

        // Should still update the valid communities
        expect(mockCommunitiesDB.updateCommunitiesRankingScores).toHaveBeenCalled()
      })
    })

    describe('and getting communities with metrics fails', () => {
      beforeEach(() => {
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockRejectedValueOnce(
          new Error('Database connection failed')
        )
      })

      it('should throw the error', async () => {
        await expect(communityRanking.calculateRankingScoreForAllCommunities()).rejects.toThrow(
          'Database connection failed'
        )
      })
    })

    describe('and communities have zero values', () => {
      beforeEach(() => {
        communitiesWithMetrics = [
          {
            communityId: 'community-3',
            eventsCount: 0,
            hasThumbnail: 0,
            photosCount: 0,
            hasDescription: 0,
            placesCount: 0,
            newMembersCount: 0,
            postsCount: 0,
            streamsCount: 0,
            eventsTotalAttendees: 0,
            streamsTotalParticipants: 0,
            ageInDays: 2 // New community gets boost
          }
        ]
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockImplementation((pagination) => {
          if (pagination?.offset === 0) {
            return Promise.resolve(communitiesWithMetrics)
          }
          return Promise.resolve([])
        })
      })

      it('should return normalized score with new community boost for zero-metric community', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        const updateCall = mockCommunitiesDB.updateCommunitiesRankingScores.mock.calls[0][0]
        const score = updateCall.get('community-3')

        // Score should be normalized (0-1 range)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)

        // Even with zero metrics, new community gets boost multiplier
        // Base normalized score is 0, so boost is 1.15x - (0 * 0.3) = 1.15x
        // But 0 * 1.15x = 0, so score should be 0
        expect(score).toBe(0)
      })
    })

    describe('and communities are older than boost threshold', () => {
      beforeEach(() => {
        communitiesWithMetrics = [
          {
            communityId: 'community-old',
            eventsCount: 10,
            hasThumbnail: 1,
            photosCount: 5,
            hasDescription: 1,
            placesCount: 5,
            newMembersCount: 10,
            postsCount: 20,
            streamsCount: 3,
            eventsTotalAttendees: 100,
            streamsTotalParticipants: 50,
            ageInDays: 45 // Older than 30 days - no boost
          }
        ]
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockImplementation((pagination) => {
          if (pagination?.offset === 0) {
            return Promise.resolve(communitiesWithMetrics)
          }
          return Promise.resolve([])
        })
      })

      it('should calculate normalized score without boost for older community', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        const updateCall = mockCommunitiesDB.updateCommunitiesRankingScores.mock.calls[0][0]
        const score = updateCall.get('community-old')

        // Score should be normalized (0-1 range)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)

        // Older community (45 days) gets no boost (multiplier = 1.0)
        // This community has good metrics, so should have a decent score
        // With normalized metrics and weights, should be around 0.4-0.6 range
        expect(score).toBeGreaterThan(0.3)
        expect(score).toBeLessThan(0.8)
      })
    })
  })
})

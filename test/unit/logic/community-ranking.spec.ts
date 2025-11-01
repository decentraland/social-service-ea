import { createRankingComponent } from '../../../src/logic/community/ranking'
import { ICommunityThumbnailComponent, IRankingComponent } from '../../../src/logic/community/types'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { createLogsMockedComponent } from '../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { createMockCommunityThumbnailComponent } from '../../mocks/communities'

describe('Ranking Component', () => {
  let rankingComponent: IRankingComponent
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    rankingComponent = createRankingComponent({
      logs: mockLogs,
      communitiesDb: mockCommunitiesDB,
      communityThumbnail: mockCommunityThumbnail
    })
  })

  describe('when calculating ranking scores for all communities', () => {
    let communitiesWithMetrics: Array<{
      id: string
      eventCount: number
      hasThumbnail: number
      photosCount: number
      hasDescription: number
      placesCount: number
      newMembersCount: number
      announcementsCount: number
      streamsCount: number
      eventsTotalAttendees: number
      streamingTotalParticipants: number
    }>

    beforeEach(() => {
      communitiesWithMetrics = [
        {
          id: 'community-1',
          eventCount: 2,
          hasThumbnail: 1,
          photosCount: 3,
          hasDescription: 1,
          placesCount: 3,
          newMembersCount: 5,
          announcementsCount: 8,
          streamsCount: 1,
          eventsTotalAttendees: 50,
          streamingTotalParticipants: 25
        },
        {
          id: 'community-2',
          eventCount: 1,
          hasThumbnail: 0,
          photosCount: 0,
          hasDescription: 0,
          placesCount: 1,
          newMembersCount: 2,
          announcementsCount: 3,
          streamsCount: 0,
          eventsTotalAttendees: 10,
          streamingTotalParticipants: 0
        }
      ]
      mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockResolvedValue(communitiesWithMetrics)
      mockCommunitiesDB.updateCommunityRankingScore.mockResolvedValue()
    })

    describe('and calculation succeeds', () => {
      it('should calculate and update scores for all communities', async () => {
        await rankingComponent.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.getAllCommunitiesWithRankingMetrics).toHaveBeenCalledTimes(1)
        expect(mockCommunitiesDB.updateCommunityRankingScore).toHaveBeenCalledTimes(communitiesWithMetrics.length)
        // community-1: (2 * 0.5) + (1 * 1) + (3 * 0.2) + (5 * 0.4) + (8 * 0.2) + (1 * 0.2) + (50 * 0.01) + (25 * 0.01) = 1 + 1 + 0.6 + 2 + 1.6 + 0.2 + 0.5 + 0.25 = 7.15
        expect(mockCommunitiesDB.updateCommunityRankingScore).toHaveBeenCalledWith('community-1', 7.15)
        // community-2: (1 * 0.5) + (0 * 1) + (1 * 0.2) + (2 * 0.4) + (3 * 0.2) + (0 * 0.2) + (10 * 0.01) + (0 * 0.01) = 0.5 + 0 + 0.2 + 0.8 + 0.6 + 0 + 0.1 + 0 = 2.2
        expect(mockCommunitiesDB.updateCommunityRankingScore).toHaveBeenCalledWith('community-2', 2.2)
      })
    })

    describe('and one community calculation fails', () => {
      beforeEach(() => {
        mockCommunitiesDB.updateCommunityRankingScore.mockRejectedValueOnce(new Error('Database error'))
      })

      it('should continue processing other communities', async () => {
        await rankingComponent.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.updateCommunityRankingScore).toHaveBeenCalledTimes(communitiesWithMetrics.length)
      })
    })

    describe('and getting communities with metrics fails', () => {
      beforeEach(() => {
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockRejectedValueOnce(
          new Error('Database connection failed')
        )
      })

      it('should throw the error', async () => {
        await expect(rankingComponent.calculateRankingScoreForAllCommunities()).rejects.toThrow(
          'Database connection failed'
        )
      })
    })

    describe('and communities have zero values', () => {
      beforeEach(() => {
        communitiesWithMetrics = [
          {
            id: 'community-3',
            eventCount: 0,
            hasThumbnail: 0,
            photosCount: 0,
            hasDescription: 0,
            placesCount: 0,
            newMembersCount: 0,
            announcementsCount: 0,
            streamsCount: 0,
            eventsTotalAttendees: 0,
            streamingTotalParticipants: 0
          }
        ]
        mockCommunitiesDB.getAllCommunitiesWithRankingMetrics.mockResolvedValue(communitiesWithMetrics)
      })

      it('should return score of 0', async () => {
        await rankingComponent.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.updateCommunityRankingScore).toHaveBeenCalledWith('community-3', 0)
      })
    })
  })
})

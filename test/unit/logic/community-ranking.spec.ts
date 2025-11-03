import { createCommunityRankingComponent } from '../../../src/logic/community/ranking'
import {
  Community,
  CommunityDB,
  CommunityPrivacyEnum,
  CommunityVisibilityEnum,
  ICommunityThumbnailComponent,
  ICommunityRankingComponent
} from '../../../src/logic/community/types'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { createLogsMockedComponent } from '../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { createMockCommunityThumbnailComponent, mockCommunity as createMockCommunity } from '../../mocks/communities'

describe('Ranking Component', () => {
  let communityRanking: ICommunityRankingComponent
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>
  let mockCommunityDB: CommunityDB
  let mockCommunity: Community

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
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
      mockCommunitiesDB.updateCommunity.mockResolvedValue(mockCommunity)
      mockCommunityThumbnail.getThumbnails.mockResolvedValue({
        'community-1': 'thumbnail-url-1',
        'community-2': undefined
      })
    })

    describe('and calculation succeeds', () => {
      it('should calculate and update scores for all communities', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.getAllCommunitiesWithRankingMetrics).toHaveBeenCalledTimes(1)
        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith(['community-1', 'community-2'])
        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledTimes(communitiesWithMetrics.length)
        // community-1: (2 * 0.5) + (1 * 1) + (3 * 0.2) + (1 * 1) + (3 * 0.2) + (5 * 0.4) + (8 * 0.2) + (1 * 0.2) + (50 * 0.01) + (25 * 0.01) = 1 + 1 + 0.6 + 1 + 0.6 + 2 + 1.6 + 0.2 + 0.5 + 0.25 = 8.75
        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith('community-1', { ranking_score: 8.75 })
        // community-2: (1 * 0.5) + (0 * 1) + (0 * 0.2) + (0 * 1) + (1 * 0.2) + (2 * 0.4) + (3 * 0.2) + (0 * 0.2) + (10 * 0.01) + (0 * 0.01) = 0.5 + 0 + 0 + 0 + 0.2 + 0.8 + 0.6 + 0 + 0.1 + 0 = 2.2
        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith('community-2', { ranking_score: 2.2 })
      })
    })

    describe('and one community calculation fails', () => {
      beforeEach(() => {
        mockCommunitiesDB.updateCommunity.mockRejectedValueOnce(new Error('Database error'))
      })

      it('should continue processing other communities', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledTimes(communitiesWithMetrics.length)
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
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({
          'community-3': undefined
        })
      })

      it('should return score of 0', async () => {
        await communityRanking.calculateRankingScoreForAllCommunities()

        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith('community-3', { ranking_score: 0 })
      })
    })
  })
})

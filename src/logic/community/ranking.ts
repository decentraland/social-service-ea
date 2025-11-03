import { ICommunityRankingComponent, CommunityRankingMetrics } from './types'
import { AppComponents } from '../../types/system'

export function createCommunityRankingComponent({
  logs,
  communitiesDb,
  communityThumbnail
}: Pick<AppComponents, 'logs' | 'communitiesDb' | 'communityThumbnail'>): ICommunityRankingComponent {
  const logger = logs.getLogger('ranking-component')

  async function calculateRankingScore(metrics: CommunityRankingMetrics): Promise<number> {
    // TODO: consider normalizing the score to a scale of 0 to 1
    const score =
      metrics.eventsCount * 0.5 +
      metrics.hasThumbnail * 1 +
      metrics.photosCount * 0.2 +
      metrics.hasDescription * 1 +
      metrics.placesCount * 0.2 +
      metrics.newMembersCount * 0.4 +
      metrics.postsCount * 0.2 +
      metrics.streamsCount * 0.2 +
      metrics.eventsTotalAttendees * 0.01 +
      metrics.streamsTotalParticipants * 0.01

    return Math.max(0, score)
  }

  async function calculateRankingScoreForAllCommunities(): Promise<void> {
    logger.info('Starting ranking score calculation for all communities')

    try {
      // Get all communities with their ranking metrics calculated in a single query
      const communitiesMetrics = await communitiesDb.getAllCommunitiesWithRankingMetrics()

      if (communitiesMetrics.length === 0) {
        logger.info('No active communities found for ranking calculation')
        return
      }

      // Check thumbnails for all communities in a single batch
      const communityIds = communitiesMetrics.map(({ communityId }) => communityId)
      const thumbnails = await communityThumbnail.getThumbnails(communityIds)

      for (const communityMetrics of communitiesMetrics) {
        try {
          const metrics: CommunityRankingMetrics = {
            ...communityMetrics,
            hasThumbnail: thumbnails[communityMetrics.communityId] ? 1 : 0
          }
          const score = await calculateRankingScore(metrics)

          logger.info('Calculated ranking score for community', {
            communityId: communityMetrics.communityId,
            score
          })

          // Update ranking score
          await communitiesDb.updateCommunity(communityMetrics.communityId, { ranking_score: score })
        } catch (error) {
          logger.error('Failed to calculate ranking score for community', {
            communityId: communityMetrics.communityId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      logger.info(`Finished ranking score calculation for ${communitiesMetrics.length} communities`)
    } catch (error) {
      logger.error(`Failed to calculate ranking scores for all communities: ${error}`)
      throw error
    }
  }

  return {
    calculateRankingScoreForAllCommunities
  }
}

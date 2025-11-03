import { IRankingComponent, RankingMetrics } from './types'
import { AppComponents } from '../../types/system'

export function createRankingComponent({
  logs,
  communitiesDb,
  communityThumbnail
}: Pick<AppComponents, 'logs' | 'communitiesDb' | 'communityThumbnail'>): IRankingComponent {
  const logger = logs.getLogger('ranking-component')

  async function calculateRankingScore(metrics: RankingMetrics): Promise<number> {
    const score =
      metrics.eventCount * 0.5 +
      metrics.hasThumbnail * 1 +
      metrics.photosCount * 0.2 +
      metrics.hasDescription * 1 +
      metrics.placesCount * 0.2 +
      metrics.newMembersCount * 0.4 +
      metrics.announcementsCount * 0.2 +
      metrics.streamsCount * 0.2 +
      metrics.eventsTotalAttendees * 0.01 +
      metrics.streamingTotalParticipants * 0.01

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
      const communityIds = communitiesMetrics.map(({ id }) => id)
      const thumbnails = await communityThumbnail.getThumbnails(communityIds)

      for (const communityMetrics of communitiesMetrics) {
        try {
          const metrics: RankingMetrics = {
            ...communityMetrics,
            hasThumbnail: thumbnails[communityMetrics.id] ? 1 : 0
          }
          const score = await calculateRankingScore(metrics)

          // Update ranking score
          await communitiesDb.updateCommunity(communityMetrics.id, { ranking_score: score })
        } catch (error) {
          logger.error('Failed to calculate ranking score for community', {
            communityId: communityMetrics.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      logger.info('Finished ranking score calculation for all communities', {
        total: communitiesMetrics.length
      })
    } catch (error) {
      logger.error('Failed to calculate ranking scores for all communities', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  return {
    calculateRankingScoreForAllCommunities
  }
}

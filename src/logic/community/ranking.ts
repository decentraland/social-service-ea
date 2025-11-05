import { ICommunityRankingComponent, CommunityRankingMetrics } from './types'
import { AppComponents } from '../../types/system'

type MetricWeight = {
  metric: Exclude<keyof CommunityRankingMetrics, 'communityId'>
  weight: number
}

type MetricWeights = Array<MetricWeight>

const DEFAULT_METRIC_WEIGHTS: MetricWeights = [
  { metric: 'eventsCount', weight: 0.5 },
  { metric: 'hasThumbnail', weight: 1 },
  { metric: 'photosCount', weight: 0.2 },
  { metric: 'hasDescription', weight: 1 },
  { metric: 'placesCount', weight: 0.2 },
  { metric: 'newMembersCount', weight: 0.4 },
  { metric: 'postsCount', weight: 0.2 },
  { metric: 'streamsCount', weight: 0.2 },
  { metric: 'eventsTotalAttendees', weight: 0.01 },
  { metric: 'streamsTotalParticipants', weight: 0.01 }
]

export function createCommunityRankingComponent({
  logs,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'communitiesDb'>): ICommunityRankingComponent {
  const logger = logs.getLogger('ranking-component')

  function calculateRankingScore(metrics: Omit<CommunityRankingMetrics, 'communityId'>): number {
    const weights: MetricWeights = DEFAULT_METRIC_WEIGHTS
    const score = weights.reduce((sum, { metric, weight }) => sum + metrics[metric] * weight, 0)

    // TODO: consider normalizing the score to a scale of 0 to 1
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

      for (const communityMetrics of communitiesMetrics) {
        const { communityId, ...metrics } = communityMetrics

        try {
          const score = calculateRankingScore(metrics)

          logger.info('Calculated ranking score for community', {
            communityId,
            score
          })

          // Update ranking score
          await communitiesDb.updateCommunity(communityId, { ranking_score: score })
        } catch (error) {
          logger.error('Failed to calculate ranking score for community', {
            communityId,
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

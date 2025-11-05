import { ICommunityRankingComponent, CommunityRankingMetrics } from './types'
import { AppComponents } from '../../types/system'

type MetricName = Exclude<keyof CommunityRankingMetrics, 'communityId' | 'ageInDays'>

type MetricWeight = {
  metric: MetricName
  weight: number
}

type MetricWeights = Array<MetricWeight>

type MetricNormalizationConfig = {
  max: number
  useLog: boolean
}

const METRIC_NORMALIZATION_CONFIG: Record<MetricName, MetricNormalizationConfig> = {
  eventsCount: { max: 50, useLog: true },
  photosCount: { max: 100, useLog: true },
  streamsCount: { max: 20, useLog: true },
  placesCount: { max: 10, useLog: false },
  postsCount: { max: 100, useLog: true },
  newMembersCount: { max: 50, useLog: true },
  eventsTotalAttendees: { max: 1000, useLog: true },
  streamsTotalParticipants: { max: 500, useLog: true },
  hasThumbnail: { max: 1, useLog: false },
  hasDescription: { max: 1, useLog: false }
} as const

const DEFAULT_METRIC_WEIGHTS: MetricWeights = [
  { metric: 'hasThumbnail', weight: 0.15 },
  { metric: 'hasDescription', weight: 0.1 },
  { metric: 'newMembersCount', weight: 0.2 },
  { metric: 'eventsCount', weight: 0.15 },
  { metric: 'eventsTotalAttendees', weight: 0.1 },
  { metric: 'postsCount', weight: 0.1 },
  { metric: 'placesCount', weight: 0.08 },
  { metric: 'streamsCount', weight: 0.07 },
  { metric: 'streamsTotalParticipants', weight: 0.04 },
  { metric: 'photosCount', weight: 0.01 }
]

const NEW_COMMUNITY_BOOST_CONFIG = {
  maxAgeForBoost: 30,
  maxBoostMultiplier: 1.15,
  minBoostMultiplier: 1.05,
  boostDecayStartDays: 7,
  scoreReductionFactor: 0.3
}

export function createCommunityRankingComponent({
  logs,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'communitiesDb'>): ICommunityRankingComponent {
  const logger = logs.getLogger('ranking-component')

  /**
   * Normalizes a metric value to 0-1 range based on its configuration.
   * Uses logarithmic scaling for metrics that can grow very large.
   * @param value - The value to normalize.
   * @param metricName - The name of the metric to normalize.
   * @returns The normalized value.
   */
  function normalizeMetric(value: number, metricName: MetricName): number {
    const config = METRIC_NORMALIZATION_CONFIG[metricName]
    if (!config) {
      return 0
    }

    const { max, useLog } = config

    if (value <= 0) {
      return 0
    }

    if (useLog) {
      const normalized = Math.log(1 + value) / Math.log(1 + max)
      return Math.min(1, normalized)
    } else {
      const normalized = value / max
      return Math.min(1, normalized)
    }
  }

  /**
   * Calculates a boost multiplier for new communities to prevent them from being penalized
   * for having low metrics. The boost decreases over time and as the community's metrics improve.
   * @param ageInDays - The age of the community in days.
   * @param normalizedScore - The normalized score before boost (0-1).
   * @returns The boost multiplier.
   */
  function calculateNewCommunityBoost(ageInDays: number, normalizedScore: number): number {
    if (ageInDays >= NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost) {
      return 1.0
    }

    const ageBasedBoost =
      ageInDays <= NEW_COMMUNITY_BOOST_CONFIG.boostDecayStartDays
        ? NEW_COMMUNITY_BOOST_CONFIG.maxBoostMultiplier
        : NEW_COMMUNITY_BOOST_CONFIG.minBoostMultiplier +
          ((NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost - ageInDays) /
            (NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost - NEW_COMMUNITY_BOOST_CONFIG.boostDecayStartDays)) *
            (NEW_COMMUNITY_BOOST_CONFIG.maxBoostMultiplier - NEW_COMMUNITY_BOOST_CONFIG.minBoostMultiplier)

    const scoreReduction = normalizedScore * NEW_COMMUNITY_BOOST_CONFIG.scoreReductionFactor
    return Math.max(1.0, ageBasedBoost - scoreReduction)
  }

  /**
   * Calculates a normalized ranking score (0-1) for a community based on its metrics.
   * The score is normalized to ensure it's always between 0 and 1, making it comparable
   * and interpretable.
   * @param metrics - The metrics to calculate the score for.
   * @returns The normalized ranking score.
   */
  function calculateRankingScore(metrics: Omit<CommunityRankingMetrics, 'communityId'>): number {
    const weights: MetricWeights = DEFAULT_METRIC_WEIGHTS

    const normalizedScore = weights.reduce((sum, { metric, weight }) => {
      const normalizedValue = normalizeMetric(metrics[metric], metric)
      return sum + normalizedValue * weight
    }, 0)

    const ageInDays = metrics.ageInDays || 0
    const boostMultiplier = calculateNewCommunityBoost(ageInDays, normalizedScore)
    const finalScore = normalizedScore * boostMultiplier

    return Math.max(0, Math.min(1, finalScore))
  }

  /**
   * Calculates the ranking score for all communities.
   */
  async function calculateRankingScoreForAllCommunities(): Promise<void> {
    logger.info('Starting ranking score calculation for all communities')

    try {
      const batchSize = 2
      let offset = 0
      let totalProcessed = 0

      while (true) {
        const communitiesMetrics = await communitiesDb.getAllCommunitiesWithRankingMetrics({
          limit: batchSize,
          offset
        })

        if (communitiesMetrics.length === 0) {
          break
        }

        const scoreUpdates = new Map<string, number>()

        for (const communityMetrics of communitiesMetrics) {
          const { communityId, ...metrics } = communityMetrics

          try {
            const score = calculateRankingScore(metrics)
            scoreUpdates.set(communityId, score)
            totalProcessed++
          } catch (error) {
            logger.error('Failed to calculate ranking score for community', {
              communityId,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }

        if (scoreUpdates.size > 0) {
          await communitiesDb.updateCommunitiesRankingScores(scoreUpdates)
          logger.info(`Updated ranking scores for ${scoreUpdates.size} communities`)
        }

        offset += batchSize
      }

      logger.info(`Finished ranking score calculation for ${totalProcessed} communities`)
    } catch (error) {
      logger.error(`Failed to calculate ranking scores for all communities: ${error}`)
      throw error
    }
  }

  return {
    calculateRankingScoreForAllCommunities
  }
}

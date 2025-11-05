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

// Metric normalization configuration
// Defines reasonable maximum values for each metric to normalize them to 0-1 range
const METRIC_NORMALIZATION_CONFIG: Record<MetricName, MetricNormalizationConfig> = {
  // Count-based metrics - use logarithmic scaling for large values
  eventsCount: { max: 50, useLog: true }, // Most communities have 0-50 events
  photosCount: { max: 100, useLog: true }, // Most communities have 0-100 photos
  streamsCount: { max: 20, useLog: true }, // Most communities have 0-20 streams
  placesCount: { max: 10, useLog: false }, // Most communities have 0-10 places
  postsCount: { max: 100, useLog: true }, // Most communities have 0-100 posts
  newMembersCount: { max: 50, useLog: true }, // Most communities get 0-50 new members per week
  eventsTotalAttendees: { max: 1000, useLog: true }, // Events can have 0-1000+ attendees
  streamsTotalParticipants: { max: 500, useLog: true }, // Streams can have 0-500+ participants
  // Boolean metrics are already 0-1
  hasThumbnail: { max: 1, useLog: false },
  hasDescription: { max: 1, useLog: false }
} as const

// Improved weights - adjusted for importance and impact
// Weights sum to ~1.0 to ensure normalized scores stay in 0-1 range
const DEFAULT_METRIC_WEIGHTS: MetricWeights = [
  { metric: 'hasThumbnail', weight: 0.15 }, // Visual presence is important
  { metric: 'hasDescription', weight: 0.1 }, // Helps users understand community
  { metric: 'newMembersCount', weight: 0.2 }, // Growth indicates active community
  { metric: 'eventsCount', weight: 0.15 }, // Events drive engagement
  { metric: 'eventsTotalAttendees', weight: 0.1 }, // Popular events indicate quality
  { metric: 'postsCount', weight: 0.1 }, // Active discussions
  { metric: 'placesCount', weight: 0.08 }, // More places = more content
  { metric: 'streamsCount', weight: 0.07 }, // Streaming activity
  { metric: 'streamsTotalParticipants', weight: 0.04 }, // Streaming engagement
  { metric: 'photosCount', weight: 0.01 } // Less important than other metrics
]

// New community boost configuration (now works with normalized 0-1 scores)
const NEW_COMMUNITY_BOOST_CONFIG = {
  // Boost applies to communities younger than this many days
  maxAgeForBoost: 30,
  // Maximum boost multiplier for very new communities (0-7 days)
  // e.g., 1.5 means 50% score increase
  maxBoostMultiplier: 1.5,
  // Minimum boost multiplier for older communities in boost range
  minBoostMultiplier: 1.1,
  // Boost decreases linearly after 7 days until maxAgeForBoost
  boostDecayStartDays: 7
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
      // Logarithmic normalization: log(1 + value) / log(1 + max)
      // This gives diminishing returns for very large values
      const normalized = Math.log(1 + value) / Math.log(1 + max)
      return Math.min(1, normalized)
    } else {
      // Linear normalization: value / max
      const normalized = value / max
      return Math.min(1, normalized)
    }
  }

  /**
   * Calculates a boost multiplier for new communities to prevent them from being penalized
   * for having low metrics. The boost is highest for very new communities and decreases
   * linearly over time.
   * @param ageInDays - The age of the community in days.
   * @returns The boost multiplier.
   */
  function calculateNewCommunityBoost(ageInDays: number): number {
    if (ageInDays >= NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost) {
      return 1.0 // No boost
    }

    if (ageInDays <= NEW_COMMUNITY_BOOST_CONFIG.boostDecayStartDays) {
      // Maximum boost for communities 0-7 days old
      return NEW_COMMUNITY_BOOST_CONFIG.maxBoostMultiplier
    }

    // Linear decay from maxBoostMultiplier to minBoostMultiplier over the remaining days
    const daysRemaining = NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost - ageInDays
    const decayPeriod = NEW_COMMUNITY_BOOST_CONFIG.maxAgeForBoost - NEW_COMMUNITY_BOOST_CONFIG.boostDecayStartDays
    const boostRange = NEW_COMMUNITY_BOOST_CONFIG.maxBoostMultiplier - NEW_COMMUNITY_BOOST_CONFIG.minBoostMultiplier
    const boost = NEW_COMMUNITY_BOOST_CONFIG.minBoostMultiplier + (daysRemaining / decayPeriod) * boostRange

    return Math.max(NEW_COMMUNITY_BOOST_CONFIG.minBoostMultiplier, boost)
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

    // Normalize each metric to 0-1 range and apply weights
    const normalizedScore = weights.reduce((sum, { metric, weight }) => {
      const normalizedValue = normalizeMetric(metrics[metric], metric)
      return sum + normalizedValue * weight
    }, 0)

    // Apply new community boost as a multiplier
    const ageInDays = metrics.ageInDays || 0
    const boostMultiplier = calculateNewCommunityBoost(ageInDays)
    const finalScore = normalizedScore * boostMultiplier

    // Ensure score stays in 0-1 range
    return Math.max(0, Math.min(1, finalScore))
  }

  /**
   * Calculates the ranking score for all communities.
   */
  async function calculateRankingScoreForAllCommunities(): Promise<void> {
    logger.info('Starting ranking score calculation for all communities')

    try {
      const batchSize = 100
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

        if (communitiesMetrics.length < batchSize) {
          break
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

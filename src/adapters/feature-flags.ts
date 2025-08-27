import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { ApplicationName } from '@well-known-components/features-component'

export enum FeatureFlag {
  // Feature flag to enable/disable AI compliance for communities.
  COMMUNITIES_AI_COMPLIANCE = 'communities_ai_compliance'
}

export type IFeatureFlagsAdapter = IBaseComponent & {
  isEnabled: (feature: FeatureFlag) => boolean
}

export async function createFeatureFlagsAdapter(
  components: Pick<AppComponents, 'logs' | 'features' | 'config'>
): Promise<IFeatureFlagsAdapter> {
  const { logs, features, config } = components

  const logger = logs.getLogger('feature-flags-adapter')
  const refreshIntervalInMs = (await config.getNumber('FEATURE_FLAG_REFRESH_INTERVAL_IN_MS')) || 4 * 60 * 1000

  const featuresFlagMap = new Map<FeatureFlag, boolean>()

  let refreshInterval: NodeJS.Timeout | null = null

  async function refresh() {
    try {
      const isEnabled = await features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.COMMUNITIES_AI_COMPLIANCE)
      logger.debug(`Refreshed ${FeatureFlag.COMMUNITIES_AI_COMPLIANCE} feature flag`, {
        isEnabled: String(isEnabled)
      })
      featuresFlagMap.set(FeatureFlag.COMMUNITIES_AI_COMPLIANCE, isEnabled)
    } catch (error) {
      logger.error('Failed to refresh feature flags', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Start component and initialize periodic feature flag refresh
   */
  async function start() {
    logger.info('Starting feature flags adapter')

    // Do initial refresh
    await refresh()

    // Set up periodic refresh
    refreshInterval = setInterval(async () => {
      await refresh()
    }, refreshIntervalInMs)

    logger.info('Feature flags adapter started', {
      refreshInterval: refreshIntervalInMs / 1000 / 60 + ' minutes'
    })
  }

  /**
   * Stop component and clear interval
   */
  async function stop() {
    logger.info('Stopping feature flags adapter')

    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }

  return {
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop,
    isEnabled: (feature: FeatureFlag) => featuresFlagMap.get(feature) ?? false
  }
}

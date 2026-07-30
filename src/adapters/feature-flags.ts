import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { ApplicationName } from '@well-known-components/features-component'

export enum FeatureFlag {
  // Feature flag to enable/disable AI compliance for communities.
  COMMUNITIES_AI_COMPLIANCE = 'communities_ai_compliance',
  // Feature flag to enable/disable AI compliance for communities in dev environment.
  DEV_COMMUNITIES_AI_COMPLIANCE = 'dev_communities_ai_compliance',
  /*
   * Feature flag to enable/disable global moderators for communities
   * When enabled, the variant should contain a comma-separated list of wallet addresses
   * that are global moderators.
   *
   * @example
   * Variant value: "0x1234567890123456789012345678901234567890,0x1234567890123456789012345678901234567891"
   */
  COMMUNITIES_GLOBAL_MODERATORS = 'communities_global_moderators',
  /*
   * Kill switch for referral registration. INVERTED on purpose: the feature works
   * while this flag is absent/off (the adapter defaults missing flags to false),
   * so deploys don't depend on the flag existing. Turn it ON to stop accepting
   * new referral registrations; clients treat the rejection as best-effort and
   * degrade gracefully. Referrals already created keep finalizing normally.
   */
  REFERRAL_REGISTRATION_DISABLED = 'referral_registration_disabled'
}

export type IFeatureFlagsAdapter = IBaseComponent & {
  isEnabled: (feature: FeatureFlag) => boolean
  getVariants: <T>(feature: FeatureFlag) => Promise<T | undefined>
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
      // The third fetch (COMMUNITIES_GLOBAL_MODERATORS) is intentionally not stored:
      // that flag is consumed live through getVariants. The hole in the destructuring
      // keeps the positions aligned with the Promise.all array.
      const [isEnabled, isDevEnabled, , isReferralRegistrationDisabled] = await Promise.all([
        features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.COMMUNITIES_AI_COMPLIANCE),
        features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.DEV_COMMUNITIES_AI_COMPLIANCE),
        features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS),
        features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.REFERRAL_REGISTRATION_DISABLED)
      ])

      logger.debug(`Refreshed feature flags`, {
        [FeatureFlag.COMMUNITIES_AI_COMPLIANCE]: String(isEnabled),
        [FeatureFlag.DEV_COMMUNITIES_AI_COMPLIANCE]: String(isDevEnabled),
        [FeatureFlag.REFERRAL_REGISTRATION_DISABLED]: String(isReferralRegistrationDisabled)
      })

      featuresFlagMap.set(FeatureFlag.COMMUNITIES_AI_COMPLIANCE, isEnabled)
      featuresFlagMap.set(FeatureFlag.DEV_COMMUNITIES_AI_COMPLIANCE, isDevEnabled)
      featuresFlagMap.set(FeatureFlag.REFERRAL_REGISTRATION_DISABLED, isReferralRegistrationDisabled)
    } catch (error) {
      logger.error('Failed to refresh feature flags', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function getVariants<T>(
    feature: FeatureFlag,
    prefixAppName: ApplicationName = ApplicationName.DAPPS
  ): Promise<T | undefined> {
    const variant = await features.getFeatureVariant(prefixAppName, feature)

    if (variant?.payload?.value) {
      const values = variant.payload.value
        .replace('\n', '')
        .split(',')
        .map((domain) => domain.toLowerCase().trim())

      return values as T
    }

    return undefined
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
    isEnabled: (feature: FeatureFlag) => featuresFlagMap.get(feature) ?? false,
    getVariants
  }
}

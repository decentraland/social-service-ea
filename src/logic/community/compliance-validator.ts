import { FeatureFlag } from '../../adapters/feature-flags'
import { AppComponents } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotCompliantError } from './errors'

export interface ICommunityComplianceValidatorComponent {
  validateCommunityContent(request: { name?: string; description?: string; thumbnailBuffer?: Buffer }): Promise<void>
}

export function createCommunityComplianceValidatorComponent(
  components: Pick<AppComponents, 'aiCompliance' | 'featureFlags' | 'logs'>
): ICommunityComplianceValidatorComponent {
  const { aiCompliance, featureFlags, logs } = components
  const logger = logs.getLogger('community-compliance-validator')

  return {
    async validateCommunityContent(request: {
      name?: string
      description?: string
      thumbnailBuffer?: Buffer
    }): Promise<void> {
      if (!featureFlags.isEnabled(FeatureFlag.COMMUNITIES_AI_COMPLIANCE)) {
        logger.info('Skipping AI compliance validation for communities because the feature flag is disabled')
        return
      }

      const { name, description, thumbnailBuffer } = request

      // Only validate if we have content to validate
      if (!name && !description && !thumbnailBuffer) {
        logger.info('No content to validate, skipping compliance check')
        return
      }

      try {
        logger.info('Starting community content compliance validation', {
          descriptionLength: description?.length || 0,
          hasThumbnail: String(!!thumbnailBuffer)
        })

        const validationResult = await aiCompliance.validateCommunityContent({
          name,
          description,
          thumbnailBuffer
        })

        if (!validationResult.isCompliant) {
          logger.warn('Community content is not compliant', {
            name: name || 'undefined',
            issues: JSON.stringify(validationResult.issues),
            confidence: validationResult.confidence
          })

          throw new CommunityNotCompliantError(
            `Community content violates Decentraland's Code of Ethics`,
            validationResult.issues,
            validationResult.confidence
          )
        }

        logger.info('Community content is compliant', {
          confidence: validationResult.confidence
        })
      } catch (error) {
        logger.error('Community compliance validation failed', {
          error: errorMessageOrDefault(error, 'Unknown error')
        })

        throw error
      }
    }
  }
}

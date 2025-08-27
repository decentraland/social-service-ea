import { FeatureFlag } from '../../adapters/feature-flags'
import { AppComponents } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotCompliantError } from './errors'

export interface ICommunityComplianceValidatorComponent {
  validateCommunityContent(request: { name: string; description: string; thumbnailBuffer?: Buffer }): Promise<void>
}

export function createCommunityComplianceValidatorComponent(
  components: Pick<AppComponents, 'aiCompliance' | 'featureFlags' | 'logs'>
): ICommunityComplianceValidatorComponent {
  const { aiCompliance, featureFlags, logs } = components
  const logger = logs.getLogger('community-compliance-validator')

  return {
    async validateCommunityContent(request: {
      name: string
      description: string
      thumbnailBuffer?: Buffer
    }): Promise<void> {
      if (!featureFlags.isEnabled(FeatureFlag.COMMUNITIES_AI_COMPLIANCE)) {
        logger.info('Skipping AI compliance validation for communities because the feature flag is disabled')
        return
      }

      const { name, description, thumbnailBuffer } = request
      const startTime = Date.now()

      try {
        logger.info('Starting community content compliance validation', {
          name,
          descriptionLength: description.length,
          hasThumbnail: String(!!thumbnailBuffer)
        })

        const validationResult = await aiCompliance.validateCommunityContent({
          name,
          description,
          thumbnailBuffer
        })

        const duration = Date.now() - startTime

        if (!validationResult.isCompliant) {
          logger.warn('Community content is not compliant', {
            name,
            issues: validationResult.issues.join(', '),
            warnings: validationResult.warnings.join(', '),
            confidence: validationResult.confidence,
            duration
          })

          throw new CommunityNotCompliantError(
            `Community content violates Decentraland's Code of Ethics: ${validationResult.reasoning}`,
            validationResult.issues,
            validationResult.warnings,
            validationResult.confidence
          )
        }

        if (validationResult.warnings.length > 0) {
          logger.info('Community content is compliant with warnings', {
            name,
            warnings: validationResult.warnings.join(', '),
            confidence: validationResult.confidence,
            duration
          })
        } else {
          logger.info('Community content is compliant', {
            name,
            confidence: validationResult.confidence,
            duration
          })
        }
      } catch (error) {
        logger.error('Community compliance validation failed', {
          name,
          error: errorMessageOrDefault(error, 'Unknown error')
        })


        throw error
      }
    }
  }
}

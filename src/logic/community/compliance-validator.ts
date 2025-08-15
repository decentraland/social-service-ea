import { AppComponents } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityComplianceError } from './errors'

export interface ICommunityComplianceValidatorComponent {
  validateCommunityContent(request: { name: string; description: string; thumbnailBuffer?: Buffer }): Promise<void>
}

export function createCommunityComplianceValidatorComponent(
  components: Pick<AppComponents, 'aiCompliance' | 'logs'>
): ICommunityComplianceValidatorComponent {
  const { aiCompliance, logs } = components
  const logger = logs.getLogger('community-compliance-validator')

  return {
    async validateCommunityContent(request: {
      name: string
      description: string
      thumbnailBuffer?: Buffer
    }): Promise<void> {
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
          logger.warn('Community content compliance validation failed', {
            name,
            violations: validationResult.violations.join(', '),
            warnings: validationResult.warnings.join(', '),
            confidence: validationResult.confidence,
            duration
          })

          throw new CommunityComplianceError(
            `Community content violates Decentraland's Code of Ethics: ${validationResult.reasoning}`,
            validationResult.violations,
            validationResult.warnings,
            validationResult.confidence
          )
        }

        if (validationResult.warnings.length > 0) {
          logger.info('Community content compliance validation passed with warnings', {
            name,
            warnings: validationResult.warnings.join(', '),
            confidence: validationResult.confidence,
            duration
          })
        } else {
          logger.info('Community content compliance validation passed', {
            name,
            confidence: validationResult.confidence,
            duration
          })
        }
      } catch (error) {
        const duration = Date.now() - startTime

        if (error instanceof CommunityComplianceError) {
          throw error
        }

        logger.error('Community content compliance validation error', {
          name,
          error: errorMessageOrDefault(error, 'Unknown error'),
          duration
        })

        throw new CommunityComplianceError(
          'Unable to validate community content compliance. Manual review required.',
          ['Compliance validation system unavailable'],
          ['Manual review recommended'],
          0
        )
      }
    }
  }
}

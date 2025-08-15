import { AppComponents } from '../../types'
import { CommunityComplianceError } from './errors'

export interface ICommunityComplianceValidatorComponent {
  validateCommunityCreation(name: string, description: string, thumbnailBuffer?: Buffer): Promise<void>

  validateCommunityUpdate(name?: string, description?: string, thumbnailBuffer?: Buffer): Promise<void>
}

export function createCommunityComplianceValidatorComponent(
  components: Pick<AppComponents, 'aiCompliance' | 'logs'>
): ICommunityComplianceValidatorComponent {
  const { aiCompliance, logs } = components
  const logger = logs.getLogger('community-compliance-validator')

  async function validateContent(
    name: string,
    description: string,
    thumbnailBuffer?: Buffer,
    context: 'creation' | 'update' = 'creation'
  ): Promise<void> {
    const startTime = Date.now()

    try {
      logger.info(`Starting ${context} compliance validation`, {
        name,
        descriptionLength: description.length,
        hasThumbnail: String(!!thumbnailBuffer)
      })

      const validationResult = await aiCompliance.validateCommunityContent(name, description, thumbnailBuffer)

      const duration = Date.now() - startTime

      if (!validationResult.isCompliant) {
        logger.warn(`Community ${context} compliance validation failed`, {
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

      // Log warnings if any (even if compliant)
      if (validationResult.warnings.length > 0) {
        logger.info(`Community ${context} compliance validation passed with warnings`, {
          name,
          warnings: validationResult.warnings.join(', '),
          confidence: validationResult.confidence,
          duration
        })
      } else {
        logger.info(`Community ${context} compliance validation passed`, {
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

      logger.error(`Community ${context} compliance validation error`, {
        name,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      })

      // If AI validation fails, we should fail safe and require manual review
      throw new CommunityComplianceError(
        'Unable to validate community content compliance. Manual review required.',
        ['Compliance validation system unavailable'],
        ['Manual review recommended'],
        0
      )
    }
  }

  return {
    async validateCommunityCreation(name: string, description: string, thumbnailBuffer?: Buffer): Promise<void> {
      await validateContent(name, description, thumbnailBuffer, 'creation')
    },

    async validateCommunityUpdate(name?: string, description?: string, thumbnailBuffer?: Buffer): Promise<void> {
      // For updates, we only validate the fields that are being changed
      // If no fields are provided, no validation is needed
      if (!name && !description && !thumbnailBuffer) {
        return
      }

      // Use existing values for fields that aren't being updated
      // This is a simplified approach - in a real implementation, you might want to
      // fetch the current community data to validate against
      const nameToValidate = name || 'Existing Community Name'
      const descriptionToValidate = description || 'Existing community description'

      await validateContent(nameToValidate, descriptionToValidate, thumbnailBuffer, 'update')
    }
  }
}

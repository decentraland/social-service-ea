import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import OpenAI from 'openai'

export interface AIContentValidatorComponents {
  config: IConfigComponent
  logs: ILoggerComponent
}

export interface AIContentValidationRequest {
  title: string
  description: string
  image?: string
}

export interface OpenAIModerationResponse {
  id: string
  model: string
  results: Array<{
    flagged: boolean
    categories: {
      sexual: boolean
      hate: boolean
      harassment: boolean
      'self-harm': boolean
      'sexual/minors': boolean
      'hate/threatening': boolean
      'violence/graphic': boolean
      'self-harm/intent': boolean
      'self-harm/instructions': boolean
      'harassment/threatening': boolean
      violence: boolean
    }
    category_scores: {
      sexual: number
      hate: number
      harassment: number
      'self-harm': number
      'sexual/minors': number
      'hate/threatening': number
      'violence/graphic': number
      'self-harm/intent': number
      'self-harm/instructions': number
      'harassment/threatening': number
      violence: number
    }
  }>
}

export interface IAIContentValidatorComponent {
  validateContent(request: AIContentValidationRequest): Promise<boolean>
}

export async function createAIContentValidatorComponent(
  components: AIContentValidatorComponents
): Promise<IAIContentValidatorComponent> {
  const { config, logs } = components
  const logger = logs.getLogger('ai-content-validator')

  const aiApiKey = await config.getString('AI_CONTENT_VALIDATION_API_KEY')

  async function validateContent(request: AIContentValidationRequest): Promise<boolean> {
    if (!aiApiKey) {
      logger.warn('AI content validation not configured, allowing content by default')
      return true
    }

    try {
      logger.info('Validating content with OpenAI API', {
        title: request.title,
        hasDescription: request.description ? 'yes' : 'no',
        hasImage: request.image ? 'yes' : 'no'
      })

      const openai = new OpenAI({
        apiKey: aiApiKey
      })

      // Build input array with text and optionally image
      const input: Array<{type: 'text', text: string} | {type: 'image_url', image_url: {url: string}}> = []
      
      // Add text content
      const textContent = `Title: ${request.title}\n\nDescription: ${request.description}`
      input.push({ type: 'text', text: textContent })
      
      // Add image if present
      if (request.image) {
        input.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${request.image}`
          }
        })
      }

      const response = await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: input
      })

      // OpenAI returns 'flagged: true' if content is inappropriate
      const isAppropriate = !response.results[0]?.flagged
      const flaggedCategories = response.results[0]?.categories
      const flaggedCategoryNames = flaggedCategories
        ? Object.entries(flaggedCategories)
            .filter(([, flagged]) => flagged)
            .map(([category]) => category)
        : []

      logger.info('Content validation result', {
        isAppropriate: isAppropriate ? 'yes' : 'no',
        flaggedCategories: flaggedCategoryNames.length > 0 ? flaggedCategoryNames.join(', ') : 'none',
        model: response.model
      })

      return isAppropriate
    } catch (error: any) {
      logger.error('Error validating content with OpenAI API', {
        error: error.message,
        stack: error.stack
      })
      return true
    }
  }


  return {
    validateContent
  }
}

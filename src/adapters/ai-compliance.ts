import OpenAI from 'openai'
import crypto from 'crypto'
import { generateLazyValidator, JSONSchema, ValidateFunction } from '@dcl/schemas'
import { AppComponents } from '../types'
import { AIComplianceError } from '../logic/community/errors'
import { errorMessageOrDefault } from '../utils/errors'
import { FeatureFlag } from './feature-flags'

export type ComplianceValidationResult = {
  isCompliant: boolean
  issues: {
    name: string[]
    description: string[]
    image: string[]
  }
  confidence: number
}

export type ComplianceValidationRequest = {
  name?: string
  description?: string
  thumbnailBuffer?: Buffer
  thumbnailMime?: 'image/png' | 'image/jpeg' | 'image/gif'
}

export interface IAIComplianceComponent {
  validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult>
}

export namespace ComplianceValidationResult {
  export const schema: JSONSchema<ComplianceValidationResult> = {
    type: 'object',
    additionalProperties: false,
    required: ['isCompliant', 'issues', 'confidence'],
    properties: {
      isCompliant: { type: 'boolean' },
      issues: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'image'],
        properties: {
          name: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string', maxLength: 25 }
          },
          description: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string', maxLength: 25 }
          },
          image: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string', maxLength: 25 }
          }
        }
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    }
  } as any as JSONSchema<ComplianceValidationResult> // hack to avoid type errors, when using strictNullChecks in test/tsconfig.json 54 test files fail

  export const validate: ValidateFunction<ComplianceValidationResult> = generateLazyValidator(schema)
}

const SYSTEM_PROMPT = `You are Decentraland's compliance expert. Analyze proposed community content against:
• Code of Ethics (conduct, law, business integrity, confidentiality/privacy, no violence, drugs/alcohol limits, equal opportunity, conflicts of interest, KYC/legitimacy, reputational/legal risk).
• Content Policy (no illegality: piracy/terrorism/obscenity/child sexual abuse, no IP infringement, no hate/harassment, no false/misleading/libel/privacy invasion, no data-privacy violations; gambling must be licensed & geo-blocked; age-restricted content (intense violence/gambling/sexual) must be 18+ with warnings).

IMPORTANT:
1) Analyze each field INDEPENDENTLY (do NOT infer issues across fields).
2) Be strict but fair. Return concise issue tags (≤25 chars) per field. Max 3 per field.
3) Output ONLY JSON that matches the provided schema.`

export async function createAIComplianceComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'featureFlags' | 'metrics' | 'memoryCache'>
): Promise<IAIComplianceComponent> {
  const { config, logs, featureFlags, metrics, memoryCache } = components
  const logger = logs.getLogger('ai-compliance')

  const env = await config.getString('ENV')
  const apiKey = await config.requireString('OPEN_AI_API_KEY')
  const model = (await config.getString('OPEN_AI_MODEL')) || 'gpt-5-nano'

  return {
    async validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult> {
      const isDevEnabled = featureFlags.isEnabled(FeatureFlag.DEV_COMMUNITIES_AI_COMPLIANCE)

      if (env !== 'prd' && !isDevEnabled) {
        logger.info('AI Compliance disabled for non-production environment', {
          env: env || 'undefined',
          isDevEnabled: String(isDevEnabled)
        })

        return {
          isCompliant: true,
          issues: {
            name: [],
            description: [],
            image: []
          },
          confidence: 1
        }
      }

      const startTime = Date.now()
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Build a content hash to memoize identical inputs
      const imageHash = request.thumbnailBuffer
        ? crypto.createHash('sha256').update(request.thumbnailBuffer).digest('hex')
        : 'no-img'
      const cacheKey = `ai-compliance:${model}:${crypto
        .createHash('sha256')
        .update(`${request.name || ''}\n${request.description || ''}\n${imageHash}`)
        .digest('hex')}`

      const cached = await memoryCache.get<ComplianceValidationResult>(cacheKey)
      if (cached) {
        const ms = Date.now() - startTime
        metrics.increment('ai_compliance_validation_total', {
          result: cached.isCompliant ? 'compliant_cached' : 'non-compliant_cached'
        })
        metrics.observe('ai_compliance_validation_duration_seconds', {}, ms / 1000)
        logger.info('Compliance validation cache hit', { requestId, ms, cacheKey: cacheKey.substring(0, 20) + '...' })
        return cached
      }

      try {
        const openai = new OpenAI({ apiKey })

        // Create the request content
        const textInput = `Analyze this community content:\n${request.name ? `Name: "${request.name}"` : ''}${request.description ? `\nDescription: "${request.description}"` : ''}${request.name || request.description ? '\n' : ''}Return JSON matching the schema.`
        let input: OpenAI.Responses.ResponseCreateParamsNonStreaming['input'] = textInput

        // Add image if provided
        if (request.thumbnailBuffer) {
          const imageDataUrl = `data:${request.thumbnailMime || 'image/png'};base64,${request.thumbnailBuffer.toString('base64')}`
          input = [
            {
              type: 'message',
              role: 'user',
              content: [
                { type: 'input_text', text: textInput },
                { type: 'input_image', image_url: imageDataUrl, detail: 'auto' }
              ]
            }
          ]
        }

        // Prepare the request using Responses API
        const body: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
          model,
          instructions: SYSTEM_PROMPT,
          input,
          text: {
            format: {
              type: 'json_schema' as const,
              name: 'ComplianceValidationResult',
              schema: ComplianceValidationResult.schema as any // hack to avoid type errors, when using strictNullChecks in test/tsconfig.json 54 test files fail
            }
          }
        }

        logger.info('Starting compliance validation...', {
          requestId,
          hasImage: String(!!request.thumbnailBuffer),
          model
        })

        const res = await openai.responses.create(body)

        if (res.usage) {
          logger.info('OpenAI API usage', {
            requestId,
            inputTokens: res.usage.input_tokens,
            inputTokensDetails: JSON.stringify(res.usage.input_tokens_details),
            outputTokens: res.usage.output_tokens,
            outputTokensDetails: JSON.stringify(res.usage.output_tokens_details),
            totalTokens: res.usage.total_tokens,
            estimatedCost: `$${((res.usage.input_tokens / 1000000) * 0.05 + (res.usage.output_tokens / 1000000) * 0.4).toFixed(6)}` // GPT-5-nano pricing per 1M tokens
          })
        }

        const content = res.output_text
        if (!content) {
          logger.error('No content in OpenAI response', {
            requestId,
            response: JSON.stringify(res, null, 2)
          })
          throw new AIComplianceError('No content received from OpenAI API')
        }

        let result: ComplianceValidationResult
        try {
          result = JSON.parse(content) as ComplianceValidationResult
        } catch (parseError) {
          const errorMessage = errorMessageOrDefault(parseError, 'Unknown error')
          logger.error('JSON parsing failed', {
            requestId,
            content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
            error: errorMessageOrDefault(parseError, 'Unknown error')
          })
          throw new AIComplianceError(`Invalid JSON response from OpenAI API: ${errorMessage}`)
        }

        // Validate the response structure using the generated validator
        if (!ComplianceValidationResult.validate(result)) {
          logger.error('Invalid response structure', {
            requestId,
            result: JSON.stringify(result),
            validationErrors: JSON.stringify(ComplianceValidationResult.validate.errors || [])
          })
          throw new AIComplianceError('Invalid response structure from OpenAI API')
        }

        const durationInSeconds = (Date.now() - startTime) / 1000
        metrics.observe('ai_compliance_validation_duration_seconds', {}, durationInSeconds)

        logger.info('Compliance validation completed', {
          requestId,
          isCompliant: String(result.isCompliant),
          issuesCount: Object.values(result.issues).flat().length,
          confidence: result.confidence,
          durationInSeconds
        })

        metrics.increment('ai_compliance_validation_total', {
          result: result.isCompliant ? 'compliant' : 'non-compliant'
        })

        // Memoize result for identical inputs
        await memoryCache.put(cacheKey, result)
        return result
      } catch (error) {
        metrics.increment('ai_compliance_validation_total', { result: 'failed' })
        const errorMessage = errorMessageOrDefault(error, 'Unknown error')

        logger.error('Compliance validation failed', {
          requestId,
          error: errorMessage
        })

        if (error instanceof AIComplianceError) {
          throw error
        }

        // Wrap other errors as AIComplianceError
        throw new AIComplianceError(`Unexpected error during compliance validation: ${errorMessage}`)
      }
    }
  }
}

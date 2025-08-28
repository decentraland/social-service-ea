import { AppComponents } from '../types'
import { AIComplianceError } from '../logic/community/errors'
import { errorMessageOrDefault } from '../utils/errors'
import { FeatureFlag } from './feature-flags'

export interface ComplianceValidationResult {
  isCompliant: boolean
  issues: string[]
  warnings: string[]
  confidence: number
  reasoning: string
}

export interface ComplianceValidationRequest {
  name: string
  description: string
  thumbnailBuffer?: Buffer
  thumbnailMime?: 'image/png' | 'image/jpeg' | 'image/gif'
}

export interface IAIComplianceComponent {
  validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult>
}

export async function createAIComplianceComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'featureFlags' | 'metrics'>
): Promise<IAIComplianceComponent> {
  const { config, logs, featureFlags, metrics } = components
  const logger = logs.getLogger('ai-compliance')

  const env = await config.getString('ENV')
  const apiKey = await config.requireString('OPEN_AI_API_KEY')
  const model = (await config.getString('OPENAI_MODEL')) || 'gpt-5-nano'

  // Comprehensive but focused prompt based on official Code of Ethics and Content Policy
  const SYSTEM_PROMPT = `You are a Decentraland compliance expert analyzing community content against our Code of Ethics (https://decentraland.org/ethics/) and Content Policy (https://decentraland.org/content).

Key compliance areas to evaluate:

CODE OF ETHICS:
1. VIOLENCE & HARASSMENT: No violence, harassment, bullying, or inappropriate behavior (Section 2.9)
2. DISCRIMINATION: No discrimination based on race, sex, marital status, medical condition, etc. (Section 2.7)
3. ILLEGAL ACTIVITIES: No promotion of illegal drugs, criminal behavior, or law violations (Section 2.2, 2.10)
4. BUSINESS INTEGRITY: No corruption, bribery, deceptive practices, or conflicts of interest (Section 5.3, 5.4)
5. REPUTATIONAL RISK: Content must not damage Decentraland's reputation as a trustworthy company (Section 1)
6. PRIVACY/CONFIDENTIALITY: No exposure of private data or confidential information (Section 2.13)
7. ENVIRONMENTAL: No promotion of environmentally harmful activities (Section 2.11)

CONTENT POLICY:
8. PROHIBITED CONTENT: No piracy, criminal activity, terrorism, obscenity, child pornography, or illegal drug use (Section 2.1)
9. INTELLECTUAL PROPERTY: No infringement of third-party IP rights (Section 2.2)
10. HATE SPEECH: No cruel or hateful content that could harm, harass, or incite hatred based on race, religion, nationality, disability, gender, age, veteran status, or sexual orientation (Section 2.3)
11. FALSE INFORMATION: No libelous, false, inaccurate, misleading content or privacy invasion (Section 2.4)
12. DATA PRIVACY: No breaches of privacy policy or applicable data privacy laws (Section 2.5)
13. GAMBLING: Gambling content must comply with licensing requirements and geo-blocking restrictions (Section 3)
14. AGE RESTRICTIONS: Violent, gambling, or sexually explicit content must be age-restricted to 18+ (Section 5)

Be strict but fair. Flag any content that violates these principles. Return ONLY valid JSON matching the exact schema provided.`

  const COMPLIANCE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['isCompliant', 'issues', 'warnings', 'confidence', 'reasoning'],
    properties: {
      isCompliant: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string', maxLength: 200 } },
      warnings: { type: 'array', items: { type: 'string', maxLength: 200 } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string', maxLength: 500 }
    }
  } as const

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
          issues: [],
          warnings: [],
          confidence: 1,
          reasoning: 'AI Compliance disabled for non-production environment'
        }
      }

      const startTime = Date.now()
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      try {
        const { default: OpenAI } = await import('openai')
        const openai = new OpenAI({ apiKey })

        const userContent: any[] = [
          {
            type: 'text',
            text: `Analyze this community content:\nName: "${request.name}"\nDescription: "${request.description}"\n\nReturn JSON matching the schema.`
          }
        ]

        if (request.thumbnailBuffer) {
          const dataUrl = `data:${request.thumbnailMime || 'image/png'};base64,${request.thumbnailBuffer.toString('base64')}`
          userContent.push({ type: 'image_url', image_url: { url: dataUrl } })
        }

        const completionParams = {
          model,
          response_format: {
            type: 'json_schema' as const,
            json_schema: {
              name: 'ComplianceValidationResult',
              schema: COMPLIANCE_SCHEMA
            }
          }
        }

        const messages = [
          { role: 'system' as const, content: SYSTEM_PROMPT },
          { role: 'user' as const, content: userContent }
        ]

        logger.info('Starting compliance validation', {
          requestId,
          name: request.name,
          hasImage: String(!!request.thumbnailBuffer),
          model
        })

        const res = await openai.chat.completions.create({
          ...completionParams,
          messages
        })

        if (res.usage) {
          logger.info('OpenAI API usage', {
            requestId,
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
            estimatedCost: `$${((res.usage.total_tokens / 1000) * 0.0001).toFixed(4)}` // GPT-5-nano pricing
          })
        }

        const content = res.choices[0]?.message?.content
        if (!content) {
          logger.error('No content in OpenAI response', {
            requestId,
            choices: JSON.stringify(res.choices),
            finishReason: res.choices[0]?.finish_reason,
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

        if (
          typeof result.isCompliant !== 'boolean' ||
          !Array.isArray(result.issues) ||
          !Array.isArray(result.warnings) ||
          typeof result.confidence !== 'number' ||
          typeof result.reasoning !== 'string'
        ) {
          logger.error('Invalid response structure', {
            requestId,
            result: JSON.stringify(result)
          })
          throw new AIComplianceError('Invalid response structure from OpenAI API')
        }

        const durationInSeconds = (Date.now() - startTime) / 1000
        metrics.observe('ai_compliance_validation_duration_seconds', {}, durationInSeconds)

        logger.info('Compliance validation completed', {
          requestId,
          name: request.name,
          isCompliant: String(result.isCompliant),
          issuesCount: result.issues.length,
          warningsCount: result.warnings.length,
          confidence: result.confidence,
          durationInSeconds
        })

        metrics.increment('ai_compliance_validation_total', {
          result: result.isCompliant ? 'compliant' : 'non-compliant'
        })

        return result
      } catch (error) {
        metrics.increment('ai_compliance_validation_total', { result: 'failed' })
        const errorMessage = errorMessageOrDefault(error, 'Unknown error')

        logger.error('Compliance validation failed', {
          requestId,
          name: request.name,
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

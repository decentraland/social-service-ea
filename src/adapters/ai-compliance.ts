import { AppComponents } from '../types'

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
}

export interface IAIComplianceComponent {
  validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult>
}

export async function createAIComplianceComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<IAIComplianceComponent> {
  const { config, logs } = components
  const logger = logs.getLogger('ai-compliance')

  const apiKey = await config.requireString('OPENAI_API_KEY')
  const model = (await config.getString('OPENAI_MODEL')) || 'gpt-5-nano'

  const DECENTRALAND_CODE_OF_ETHICS = `DECENTRALAND'S CODE OF ETHICS

Our Values of integrity, responsibility, respect and pioneering govern everything we do. Our reputation as a company that users can trust is our most valuable asset.

POLICIES AND PRINCIPLES:

1. Standard of Conduct: We conduct all operations with honesty, integrity and openness, respecting human rights and interests.

2. Compliance with Law: We have zero tolerance for issues of applicable laws and regulations.

3. Equal Opportunity Employment: We strictly prohibit unlawful discrimination, harassment, bullying in any form – verbal, physical, or visual.

4. No Violence: We are committed to a violence-free environment with zero tolerance for any level of violence, harassment or inappropriate behavior.

5. Drugs and Alcohol: Substance abuse is incompatible with health and safety. Illegal drugs are strictly prohibited.

6. Confidentiality: We maintain confidentiality regarding internal corporate matters and protect data privacy and security.

7. Business Integrity: We avoid corruption and do not give or receive bribes or improper payments for business gain.

8. Conflicts of Interest: All employees must avoid personal activities that could conflict with their responsibilities to the Company.

9. Know Your Client: We must identify directors, shareholders and final economic beneficiaries before entering contracts.

10. Risk Matters: We ensure Decentraland does not receive proceeds of criminal activities and screen third parties for legitimacy.`

  return {
    async validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult> {
      const startTime = Date.now()

      try {
        const { default: OpenAI } = await import('openai')
        const openai = new OpenAI({ apiKey })

        const systemPrompt = `You are a compliance expert for Decentraland. Analyze community content against our Code of Ethics and return a structured response.

Be strict but fair. Flag any content that could violate our values of integrity, responsibility, respect, or pioneering. Consider potential legal, ethical, or reputational risks.

When analyzing thumbnail images, pay special attention to visual content that may violate our Code of Ethics, including inappropriate imagery, violence, discrimination, or other issues that might not be apparent from text alone.

You must respond with a valid JSON object matching the exact structure specified.`

        const userPrompt = `Please analyze the following community content against Decentraland's Code of Ethics:
            
Community Name: "${request.name}"
Community Description: "${request.description}"
${request.thumbnailBuffer ? `Thumbnail Image Data: ${request.thumbnailBuffer.toString('base64')}` : 'Thumbnail: None provided'}
            
Code of Ethics:
${DECENTRALAND_CODE_OF_ETHICS}
            
Please evaluate if this community content complies with our ethical standards. Consider:

1. VIOLENCE & HARASSMENT: Does the content promote violence, hate, harassment, bullying, or inappropriate behavior? (Section 4, 9)
2. DISCRIMINATION: Does it contain discriminatory content based on race, sex, marital status, medical condition, or other protected characteristics? (Section 3)
3. ILLEGAL ACTIVITIES: Does it promote illegal activities, substance abuse, or criminal behavior? (Section 5, 10)
4. BUSINESS INTEGRITY: Does it violate principles of honesty, integrity, or fair competition? (Section 1, 7)
5. REPUTATIONAL RISK: Could it damage Decentraland's reputation as a trustworthy company? (Section 1)
6. LEGAL COMPLIANCE: Does it comply with applicable laws and regulations? (Section 2)
7. CONFIDENTIALITY: Does it expose confidential information or violate privacy? (Section 6)

IMPORTANT: If a thumbnail image is provided, carefully analyze the visual content for any issues of the Code of Ethics. Images can contain inappropriate content that text alone might not reveal.

Return your analysis as a JSON object with the exact structure:
{
  "isCompliant": boolean,
  "issues": ["list of specific issues"],
  "warnings": ["list of warnings"],
  "confidence": number (0-1),
  "reasoning": "detailed explanation"
}`

        const userContent: any[] = [{ type: 'text', text: userPrompt }]
        if (request.thumbnailBuffer) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${request.thumbnailBuffer.toString('base64')}` }
          })
        }

        const res = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent as any }
          ],
          response_format: { type: 'json_object' }
        })

        logger.info('OpenAI complete response', { res: JSON.stringify(res) })

        if (res.usage) {
          logger.debug('Usage details', {
            usage: JSON.stringify(res.usage),
            systemFingerprint: res.system_fingerprint || 'N/A',
            serviceTier: res.service_tier || 'N/A',
            model: res.model || 'N/A',
            finishReason: res.choices[0]?.finish_reason
          })
        }

        const content = res.choices[0]?.message?.content
        if (!content) throw new Error('No content received from OpenAI API')

        let result: ComplianceValidationResult
        try {
          result = JSON.parse(content) as ComplianceValidationResult
        } catch (parseError) {
          logger.error('Failed to parse OpenAI response as JSON', {
            content,
            error: parseError instanceof Error ? parseError.message : 'Unknown error'
          })
          throw new Error('Invalid JSON response from OpenAI API')
        }

        // Validate the response structure
        if (
          typeof result.isCompliant !== 'boolean' ||
          !Array.isArray(result.issues) ||
          !Array.isArray(result.warnings) ||
          typeof result.confidence !== 'number' ||
          typeof result.reasoning !== 'string'
        ) {
          logger.error('Invalid response structure from OpenAI', { result: JSON.stringify(result) })
          throw new Error('Invalid response structure from OpenAI API')
        }

        const duration = Date.now() - startTime
        logger.info('Community content compliance validation completed', {
          name: request.name,
          isCompliant: String(result.isCompliant),
          issues: result.issues.length,
          warnings: result.warnings.length,
          confidence: result.confidence,
          duration
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('Community content compliance validation failed', {
          name: request.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration
        })
        throw error
      }
    }
  }
}

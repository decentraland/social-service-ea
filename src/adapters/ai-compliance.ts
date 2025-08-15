import { AppComponents } from '../types'

export interface ComplianceValidationResult {
  isCompliant: boolean
  violations: string[]
  warnings: string[]
  confidence: number
  reasoning: string
}

export interface ComplianceValidationRequest {
  name: string
  description: string
  thumbnailBuffer?: Buffer
}

export interface ComplianceValidationPrompt {
  systemMessage: string
  userMessage: string
}

export interface IAIProvider {
  validateContent(prompt: ComplianceValidationPrompt): Promise<string>
  readonly name: string
}

export interface IAIComplianceComponent {
  validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult>
}

export interface IComplianceValidator {
  validateResponse(content: string): ComplianceValidationResult
}

export interface ICompliancePromptBuilder {
  buildPrompt(request: ComplianceValidationRequest): ComplianceValidationPrompt
}

export async function createOpenAIProvider({ config }: Pick<AppComponents, 'config'>): Promise<IAIProvider> {
  const apiKey = await config.requireString('OPENAI_API_KEY')
  const apiUrl = await config.getString('OPENAI_API_URL')
  const model = (await config.getString('OPENAI_MODEL')) || 'gpt-4o'

  return {
    name: 'OpenAI',
    async validateContent(prompt: ComplianceValidationPrompt): Promise<string> {
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({
        apiKey,
        ...(apiUrl && { baseURL: apiUrl })
      })

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: prompt.systemMessage },
          { role: 'user', content: prompt.userMessage }
        ],
        max_tokens: 1000,
        temperature: 0.1
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI API')
      }

      return content
    }
  }
}

export async function createClaudeProvider({ config }: Pick<AppComponents, 'config'>): Promise<IAIProvider> {
  const apiKey = await config.requireString('CLAUDE_API_KEY')
  const model = (await config.getString('CLAUDE_MODEL')) || 'claude-3-haiku-20240307'

  return {
    name: 'Claude',
    async validateContent(prompt: ComplianceValidationPrompt): Promise<string> {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey })

      const response = await anthropic.messages.create({
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt.userMessage }],
        system: prompt.systemMessage
      })

      const content = response.content[0]
      if (!content || content.type !== 'text') {
        throw new Error('No valid text content received from Claude API')
      }

      return content.text
    }
  }
}

export function createCompliancePromptBuilder(): ICompliancePromptBuilder {
  const DECENTRALAND_CODE_OF_ETHICS = `DECENTRALAND'S CODE OF ETHICS

Our Values of integrity, responsibility, respect and pioneering govern everything we do. Our reputation as a company that users can trust is our most valuable asset.

POLICIES AND PRINCIPLES:

1. Standard of Conduct: We conduct all operations with honesty, integrity and openness, respecting human rights and interests.

2. Compliance with Law: We have zero tolerance for violations of applicable laws and regulations.

3. Equal Opportunity Employment: We strictly prohibit unlawful discrimination, harassment, bullying in any form – verbal, physical, or visual.

4. No Violence: We are committed to a violence-free environment with zero tolerance for any level of violence, harassment or inappropriate behavior.

5. Drugs and Alcohol: Substance abuse is incompatible with health and safety. Illegal drugs are strictly prohibited.

6. Confidentiality: We maintain confidentiality regarding internal corporate matters and protect data privacy and security.

7. Business Integrity: We avoid corruption and do not give or receive bribes or improper payments for business gain.

8. Conflicts of Interest: All employees must avoid personal activities that could conflict with their responsibilities to the Company.

9. Know Your Client: We must identify directors, shareholders and final economic beneficiaries before entering contracts.

10. Risk Matters: We ensure Decentraland does not receive proceeds of criminal activities and screen third parties for legitimacy.`

  return {
    buildPrompt(request: ComplianceValidationRequest): ComplianceValidationPrompt {
      const systemMessage = `You are a compliance expert for Decentraland. Analyze community content against our Code of Ethics and return a JSON response with the following structure:
{
  "isCompliant": boolean,
  "violations": ["list of specific violations"],
  "warnings": ["list of warnings"],
  "confidence": number (0-1),
  "reasoning": "detailed explanation"
}
              
Be strict but fair. Flag any content that could violate our values of integrity, responsibility, respect, or pioneering. Consider potential legal, ethical, or reputational risks.

IMPORTANT: When analyzing thumbnail images, pay special attention to visual content that may violate our Code of Ethics, including inappropriate imagery, violence, discrimination, or other violations that might not be apparent from text alone.`

      const userMessage = `Please analyze the following community content against Decentraland's Code of Ethics:
            
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

IMPORTANT: If a thumbnail image is provided, carefully analyze the visual content for any violations of the Code of Ethics. Images can contain inappropriate content that text alone might not reveal.

Return your analysis as a JSON object with specific references to which sections of the Code of Ethics are violated or at risk.`

      return { systemMessage, userMessage }
    }
  }
}

export function createComplianceResponseValidator(): IComplianceValidator {
  return {
    validateResponse(content: string): ComplianceValidationResult {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response')
      }

      const result = JSON.parse(jsonMatch[0]) as ComplianceValidationResult

      if (
        typeof result.isCompliant !== 'boolean' ||
        !Array.isArray(result.violations) ||
        !Array.isArray(result.warnings) ||
        typeof result.confidence !== 'number' ||
        typeof result.reasoning !== 'string'
      ) {
        throw new Error('Invalid response structure from AI API')
      }

      return result
    }
  }
}

export async function createAIComplianceComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<IAIComplianceComponent> {
  const { config, logs } = components
  const logger = logs.getLogger('ai-compliance')

  const promptBuilder = createCompliancePromptBuilder()
  const responseValidator = createComplianceResponseValidator()

  const providers: IAIProvider[] = []

  try {
    await config.requireString('OPENAI_API_KEY')
    providers.push(await createOpenAIProvider(components))
    logger.info('OpenAI provider initialized successfully')
  } catch (error) {
    logger.warn('OpenAI provider not available - missing API key')
  }

  try {
    await config.requireString('CLAUDE_API_KEY')
    providers.push(await createClaudeProvider(components))
    logger.info('Claude provider initialized successfully')
  } catch (error) {
    logger.warn('Claude provider not available - missing API key')
  }

  if (providers.length === 0) {
    throw new Error('No AI providers available - both OPENAI_API_KEY and CLAUDE_API_KEY are missing')
  }

  logger.info(`AI compliance component initialized with ${providers.length} provider(s)`)

  async function validateWithProvider(
    provider: IAIProvider,
    prompt: ComplianceValidationPrompt
  ): Promise<ComplianceValidationResult> {
    try {
      const content = await provider.validateContent(prompt)
      return responseValidator.validateResponse(content)
    } catch (error) {
      logger.error('Provider validation failed', {
        provider: provider.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  return {
    async validateCommunityContent(request: ComplianceValidationRequest): Promise<ComplianceValidationResult> {
      const startTime = Date.now()
      const prompt = promptBuilder.buildPrompt(request)

      try {
        let lastError: Error | undefined

        for (const provider of providers) {
          try {
            const result = await validateWithProvider(provider, prompt)

            const duration = Date.now() - startTime
            logger.info('Community content compliance validation completed', {
              name: request.name,
              provider: provider.name,
              isCompliant: String(result.isCompliant),
              violations: result.violations.length,
              warnings: result.warnings.length,
              confidence: result.confidence,
              duration
            })

            return result
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error')
            logger.warn('Provider failed, trying next one', {
              provider: provider.name,
              error: lastError.message
            })
          }
        }

        throw lastError || new Error('All AI providers failed')
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

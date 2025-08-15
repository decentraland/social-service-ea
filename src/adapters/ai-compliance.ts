import { AppComponents } from '../types'

export interface ComplianceValidationResult {
  isCompliant: boolean
  violations: string[]
  warnings: string[]
  confidence: number
  reasoning: string
}

export interface IAIComplianceComponent {
  validateCommunityContent(
    name: string,
    description: string,
    thumbnailBuffer?: Buffer
  ): Promise<ComplianceValidationResult>
}

export function createAIComplianceComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetcher'>
): IAIComplianceComponent {
  const { config, logs, fetcher } = components
  const logger = logs.getLogger('ai-compliance')

  const DECENTRALAND_CODE_OF_ETHICS = `
DECENTRALAND'S CODE OF ETHICS
  
Our Values: integrity, responsibility, respect and pioneering govern everything we do.
  
POLICIES AND PRINCIPLES:
  
2.1 Standard of Conduct: We conduct all operations with honesty, integrity and openness, respecting human rights and interests.
  
2.2 Compliance with Law: Zero tolerance for violations of applicable laws and regulations.
  
2.3 Financial Recordkeeping: All transactions must be approved by Compliance Team.
  
2.4 Reporting: Breaches must be reported to compliance@decentraland.org.
  
2.5 Monitoring: Decentraland monitors use of company property to prevent illegal acts.
  
2.6 Employees: Committed to diversity, equal opportunity, mutual trust and respect.
  
2.7 Equal Opportunity: Employment based on merit and qualifications, prohibiting discrimination and harassment.
  
2.8 Health and Safety: Safe work environment with health and safety compliance.
  
2.9 No Violence: Zero tolerance for violence, harassment or inappropriate behavior.
  
2.10 Drugs and Alcohol: Substance abuse prohibited, alcohol banned except special events.
  
2.11 Environment: Promote environmental care and recycling procedures.
  
2.12 Records and Reports: Correct and truthful reporting required.
  
2.13 Confidentiality: Maintain confidentiality of internal corporate matters.
  
5.3 Business Integrity: No bribes or improper payments for business gain.
  
5.4 Conflicts of Interest: Avoid personal activities conflicting with company responsibilities.
  
6. Risk Matters: Ensure no proceeds from criminal activities, screen third parties.
  
7. Breaches: Violations result in disciplinary measures including termination.
`

  async function callOpenAI(prompt: string, maxTokens: number = 1000): Promise<ComplianceValidationResult> {
    try {
      const apiKey = await config.requireString('OPENAI_API_KEY')
      const apiUrl = (await config.getString('OPENAI_API_URL')) || 'https://api.openai.com/v1/chat/completions'
      const model = (await config.getString('OPENAI_MODEL')) || 'gpt-4o-mini'

      const response = await fetcher.fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a compliance expert for Decentraland. Analyze community content against our Code of Ethics and return a JSON response with the following structure:
{
  "isCompliant": boolean,
  "violations": ["list of specific violations"],
  "warnings": ["list of warnings"],
  "confidence": number (0-1),
  "reasoning": "detailed explanation"
}
              
Be strict but fair. Flag any content that could violate our values of integrity, responsibility, respect, or pioneering. Consider potential legal, ethical, or reputational risks.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature: 0.1
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const content = data.choices[0]?.message?.content

      if (!content) {
        throw new Error('No content received from OpenAI API')
      }

      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in OpenAI response')
      }

      const result = JSON.parse(jsonMatch[0]) as ComplianceValidationResult

      // Validate the response structure
      if (
        typeof result.isCompliant !== 'boolean' ||
        !Array.isArray(result.violations) ||
        !Array.isArray(result.warnings) ||
        typeof result.confidence !== 'number' ||
        typeof result.reasoning !== 'string'
      ) {
        throw new Error('Invalid response structure from OpenAI API')
      }

      return result
    } catch (error) {
      logger.error('Error calling OpenAI API', { error: error instanceof Error ? error.message : 'Unknown error' })

      // Return a safe default response
      return {
        isCompliant: false,
        violations: ['Unable to validate compliance due to technical error'],
        warnings: ['Compliance validation failed - manual review required'],
        confidence: 0,
        reasoning: 'Technical error prevented automated compliance validation'
      }
    }
  }

  async function callClaude(prompt: string, maxTokens: number = 1000): Promise<ComplianceValidationResult> {
    try {
      const apiKey = await config.requireString('CLAUDE_API_KEY')
      const apiUrl = (await config.getString('CLAUDE_API_URL')) || 'https://api.anthropic.com/v1/messages'
      const model = (await config.getString('CLAUDE_MODEL')) || 'claude-3-haiku-20240307'

      const response = await fetcher.fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          system: `You are a compliance expert for Decentraland. Analyze community content against our Code of Ethics and return a JSON response with the following structure:
{
  "isCompliant": boolean,
  "violations": ["list of specific violations"],
  "warnings": ["list of warnings"],
  "confidence": number (0-1),
  "reasoning": "detailed explanation"
}
            
Be strict but fair. Flag any content that could violate our values of integrity, responsibility, respect, or pioneering. Consider potential legal, ethical, or reputational risks.`
        })
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const content = data.content[0]?.text

      if (!content) {
        throw new Error('No content received from Claude API')
      }

      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response')
      }

      const result = JSON.parse(jsonMatch[0]) as ComplianceValidationResult

      // Validate the response structure
      if (
        typeof result.isCompliant !== 'boolean' ||
        !Array.isArray(result.violations) ||
        !Array.isArray(result.warnings) ||
        typeof result.confidence !== 'number' ||
        typeof result.reasoning !== 'string'
      ) {
        throw new Error('Invalid response structure from Claude API')
      }

      return result
    } catch (error) {
      logger.error('Error calling Claude API', { error: error instanceof Error ? error.message : 'Unknown error' })

      // Return a safe default response
      return {
        isCompliant: false,
        violations: ['Unable to validate compliance due to technical error'],
        warnings: ['Compliance validation failed - manual review required'],
        confidence: 0,
        reasoning: 'Technical error prevented automated compliance validation'
      }
    }
  }

  return {
    async validateCommunityContent(
      name: string,
      description: string,
      thumbnailBuffer?: Buffer
    ): Promise<ComplianceValidationResult> {
      const startTime = Date.now()

      try {
        // Create the validation prompt
        const prompt = `Please analyze the following community content against Decentraland's Code of Ethics:
            
Community Name: "${name}"
Community Description: "${description}"
${thumbnailBuffer ? 'Has Thumbnail: Yes (image content)' : 'Has Thumbnail: No'}
            
Code of Ethics:
${DECENTRALAND_CODE_OF_ETHICS}
            
Please evaluate if this community content complies with our ethical standards. Consider:
1. Does the name/description promote violence, hate, or illegal activities?
2. Does it contain inappropriate or offensive content?
3. Does it violate our values of integrity, responsibility, respect, or pioneering?
4. Could it create legal, ethical, or reputational risks for Decentraland?
5. Does it comply with applicable laws and regulations?
            
Return your analysis as a JSON object.`

        // Try OpenAI first, fallback to Claude
        let result: ComplianceValidationResult

        try {
          const openaiKey = await config.getString('OPENAI_API_KEY')
          if (openaiKey) {
            result = await callOpenAI(prompt)
          } else {
            const claudeKey = await config.requireString('CLAUDE_API_KEY')
            result = await callClaude(prompt)
          }
        } catch (error) {
          // Fallback to Claude if OpenAI fails
          const claudeKey = await config.requireString('CLAUDE_API_KEY')
          result = await callClaude(prompt)
        }

        const duration = Date.now() - startTime

        logger.info('Community content compliance validation completed', {
          name,
          isCompliant: String(result.isCompliant),
          violations: result.violations.length,
          warnings: result.warnings.length,
          confidence: result.confidence,
          duration
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('Community content compliance validation failed', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration
        })

        throw error
      }
    }
  }
}

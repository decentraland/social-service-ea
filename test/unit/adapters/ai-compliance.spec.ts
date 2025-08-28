import { createAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { mockConfig, mockLogs, createFeatureFlagsMockComponent } from '../../mocks/components'
import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { AIComplianceError } from '../../../src/logic/community/errors'
import { IFeatureFlagsAdapter } from '../../../src/adapters/feature-flags'
import { IMetricsComponent } from '@well-known-components/interfaces'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricDeclarations } from '../../../src/metrics'

const mockOpenAICreate = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: mockOpenAICreate
    }
  }))
}))

describe('AIComplianceComponent', () => {
  const name = 'Test Community'
  const description = 'A test community for testing purposes'
  const thumbnailBuffer = Buffer.from('fake-image-data')

  let aiCompliance: IAIComplianceComponent
  let mockResponse: any
  let featureFlagsMock: jest.Mocked<IFeatureFlagsAdapter>
  let mockMetrics: IMetricsComponent<keyof typeof metricDeclarations>

  beforeEach(() => {
    mockConfig.requireString.mockImplementation((key: string) => {
      if (key === 'OPEN_AI_API_KEY') return Promise.resolve('test-api-key')
      return Promise.reject(new Error(`Unknown key: ${key}`))
    })

    mockConfig.getString.mockImplementation((key: string) => {
      if (key === 'ENV') return Promise.resolve('dev')
      if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })

    featureFlagsMock = createFeatureFlagsMockComponent({})
    mockMetrics = createTestMetricsComponent(metricDeclarations)

    jest.spyOn(mockMetrics, 'observe')
    jest.spyOn(mockMetrics, 'increment')
  })

  describe('when the environment is not production', () => {
    beforeEach(() => {
      mockConfig.getString.mockImplementation((key: string) => {
        if (key === 'ENV') return Promise.resolve('dev')
        if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })
    })

    describe('and the feature flag to enable AI compliance in dev is disabled', () => {
      beforeEach(async () => {
        featureFlagsMock.isEnabled.mockReturnValueOnce(false)
        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs,
          featureFlags: featureFlagsMock,
          metrics: mockMetrics
        })
      })

      it('should return a mock response', async () => {
        const result = await aiCompliance.validateCommunityContent({ name, description })

        expect(result).toEqual({
          isCompliant: true,
          issues: {},
          confidence: 1,
          reasoning: 'AI Compliance disabled for non-production environment'
        })
      })
    })

    describe('and the feature flag to enable AI compliance in dev is enabled', () => {
      beforeEach(async () => {
        featureFlagsMock.isEnabled.mockReturnValueOnce(true)
        mockOpenAICreate.mockResolvedValue({
          output_text: JSON.stringify({
            isCompliant: true,
            issues: {},
            confidence: 1,
            reasoning: 'AI Compliance enabled for non-production environment'
          }),
          usage: {}
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs,
          featureFlags: featureFlagsMock,
          metrics: mockMetrics
        })
      })

      it('should validate the community using the AI compliance service', async () => {
        await aiCompliance.validateCommunityContent({ name, description })
        expect(mockOpenAICreate).toHaveBeenCalled()
      })
    })
  })

  describe('when the environment is production', () => {
    beforeEach(() => {
      mockConfig.getString.mockImplementation((key: string) => {
        if (key === 'ENV') return Promise.resolve('prd')
        if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })
    })

    describe('and initializing the component', () => {
      describe('and OPENAI_MODEL is not set', () => {
        beforeEach(() => {
          mockConfig.getString.mockImplementation((key: string) => {
            if (key === 'ENV') return Promise.resolve('prd')
            if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
            return Promise.resolve(undefined)
          })
        })

        it('should create component with default model', async () => {
          aiCompliance = await createAIComplianceComponent({
            config: mockConfig,
            logs: mockLogs,
            featureFlags: featureFlagsMock,
            metrics: mockMetrics
          })

          expect(aiCompliance).toBeDefined()
          expect(mockConfig.requireString).toHaveBeenCalledWith('OPEN_AI_API_KEY')
          expect(mockConfig.getString).toHaveBeenCalledWith('OPENAI_MODEL')
          expect(mockConfig.getString).toHaveBeenCalledWith('ENV')
        })
      })

      describe('and OPENAI_MODEL is set', () => {
        beforeEach(() => {
          mockConfig.getString.mockImplementation((key: string) => {
            if (key === 'ENV') return Promise.resolve('prd')
            if (key === 'OPENAI_MODEL') return Promise.resolve('gpt-5')
            return Promise.resolve(undefined)
          })
        })

        it('should create component with custom model', async () => {
          aiCompliance = await createAIComplianceComponent({
            config: mockConfig,
            logs: mockLogs,
            featureFlags: featureFlagsMock,
            metrics: mockMetrics
          })

          expect(aiCompliance).toBeDefined()
        })
      })

      describe('and OPEN_AI_API_KEY is missing', () => {
        beforeEach(() => {
          mockConfig.requireString.mockImplementation((key: string) => {
            if (key === 'OPEN_AI_API_KEY') return Promise.reject(new Error('OPEN_AI_API_KEY not found'))
            return Promise.reject(new Error('Unknown key: OPEN_AI_API_KEY'))
          })
        })

        it('should throw error', async () => {
          await expect(
            createAIComplianceComponent({
              config: mockConfig,
              logs: mockLogs,
              featureFlags: featureFlagsMock,
              metrics: mockMetrics
            })
          ).rejects.toThrow('OPEN_AI_API_KEY not found')
        })
      })
    })

    describe('when validating community content', () => {
      beforeEach(async () => {
        // Ensure we're in production mode for these tests
        mockConfig.getString.mockImplementation((key: string) => {
          if (key === 'ENV') return Promise.resolve('prd')
          if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
          return Promise.resolve(undefined)
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs,
          featureFlags: featureFlagsMock,
          metrics: mockMetrics
        })
      })

      describe('and content is compliant', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: true,
              issues: {},
              confidence: 0.95,
              reasoning: 'Content is compliant with ethical standards'
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 150,
              total_tokens: 650
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should validate content successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(result.issues).toEqual({})
          expect(result.confidence).toBe(0.95)
          expect(result.reasoning).toBe('Content is compliant with ethical standards')
        })

        it('should call OpenAI to validate the community content', async () => {
          await aiCompliance.validateCommunityContent({ name, description })

          expect(mockOpenAICreate).toHaveBeenCalledWith(
            expect.objectContaining({
              model: 'gpt-5-nano',
              text: {
                format: {
                  type: 'json_schema',
                  name: 'ComplianceValidationResult',
                  schema: expect.any(Object)
                }
              },
              instructions: expect.stringContaining('Decentraland compliance expert'),
              input: expect.stringContaining(name)
            })
          )
        })

        it('should log usage information', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          expect(mockLogs.getLogger).toHaveBeenCalledWith('ai-compliance')
        })

        it('should observe the duration of the validation', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          expect(mockMetrics.observe).toHaveBeenCalledWith(
            'ai_compliance_validation_duration_seconds',
            {},
            expect.any(Number)
          )
        })

        it('should increment the total validation counter with compliant result', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', { result: 'compliant' })
        })
      })

      describe('and content has compliance issues', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: false,
              issues: {
                name: ['Inappropriate language'],
                description: ['Illegal activities'],
                image: null
              },
              confidence: 0.85,
              reasoning: 'Content violates ethical standards'
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 200,
              total_tokens: 700
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should return violation details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(false)
          expect(result.issues).toEqual({
            name: ['Inappropriate language'],
            description: ['Illegal activities'],
            image: null
          })
          expect(result.confidence).toBe(0.85)
          expect(result.reasoning).toBe('Content violates ethical standards')
        })

        it('should increment the total validation counter with non-compliant result', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', {
            result: 'non-compliant'
          })
        })
      })

      describe('and content has warnings but is compliant', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: true,
              issues: {
                name: null,
                description: null,
                image: null
              },
              confidence: 0.8,
              reasoning: 'Content is compliant with minor concerns'
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 180,
              total_tokens: 680
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should return warning details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(result.issues).toEqual({
            name: null,
            description: null,
            image: null
          })
          expect(result.confidence).toBe(0.8)
        })
      })

      describe('and validating content with thumbnails', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: true,
              issues: {
                name: null,
                description: null,
                image: null
              },
              confidence: 0.95,
              reasoning: 'Content with thumbnail is compliant'
            }),
            usage: {
              input_tokens: 800,
              output_tokens: 150,
              total_tokens: 950
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should handle thumbnail validation successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({
            name,
            description,
            thumbnailBuffer,
            thumbnailMime: 'image/png'
          })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledWith(
            expect.objectContaining({
              input: expect.arrayContaining([
                expect.objectContaining({
                  type: 'message',
                  role: 'user',
                  content: expect.arrayContaining([
                    expect.objectContaining({
                      type: 'input_image',
                      image_url: expect.stringContaining('data:image/png;base64,')
                    })
                  ])
                })
              ])
            })
          )
        })
      })

      describe('and OpenAI returns empty content', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: null,
            usage: {
              input_tokens: 500,
              output_tokens: 0,
              total_tokens: 500
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should throw AIComplianceError for empty content', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(
            'No content received from OpenAI API'
          )
        })

        it('should increment the total validation counter with failed result for empty content', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', { result: 'failed' })
        })
      })

      describe('and OpenAI returns invalid JSON', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: 'This is not valid JSON',
            usage: {
              input_tokens: 500,
              output_tokens: 50,
              total_tokens: 550
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should throw AIComplianceError for invalid JSON', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(
            'Invalid JSON response from OpenAI API: Unexpected token'
          )
        })

        it('should increment the total validation counter with failed result for invalid JSON', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', { result: 'failed' })
        })
      })

      describe('and OpenAI returns malformed response structure', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: true,
              // Missing required fields
              issues: {
                name: null,
                description: null,
                image: null
              }
              // confidence, reasoning missing
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 100,
              total_tokens: 600
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should throw AIComplianceError for malformed response', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(
            'Invalid response structure from OpenAI API'
          )
        })

        it('should increment the total validation counter with failed result for malformed response', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', { result: 'failed' })
        })
      })

      describe('and OpenAI API throws an error', () => {
        beforeEach(() => {
          const apiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(apiError)
        })

        it('should throw AIComplianceError when API call fails', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(
            'Unexpected error during compliance validation: OpenAI API error'
          )
        })

        it('should increment the total validation counter with failed result for API errors', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          expect(mockMetrics.increment).toHaveBeenCalledWith('ai_compliance_validation_total', { result: 'failed' })
        })
      })

      describe('and AI compliance process fails', () => {
        beforeEach(() => {
          const processError = new AIComplianceError('Test process failure')
          mockOpenAICreate.mockRejectedValue(processError)
        })

        it('should throw AIComplianceError for process failures', async () => {
          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(AIComplianceError)

          await expect(aiCompliance.validateCommunityContent({ name, description })).rejects.toThrow(
            'Test process failure'
          )
        })
      })

      describe('and OpenAI API returns usage information', () => {
        beforeEach(() => {
          mockResponse = {
            output_text: JSON.stringify({
              isCompliant: true,
              issues: {
                name: null,
                description: null,
                image: null
              },
              confidence: 0.95,
              reasoning: 'Content is compliant'
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 150,
              total_tokens: 650
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should log usage information correctly', async () => {
          await aiCompliance.validateCommunityContent({ name, description })

          // Verify that the logger was called with usage info
          expect(mockLogs.getLogger).toHaveBeenCalledWith('ai-compliance')
        })
      })
    })
  })
})

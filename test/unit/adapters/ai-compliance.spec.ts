import { ComplianceValidationResult, createAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { mockConfig, mockLogs } from '../../mocks/components'
import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'

const mockOpenAICreate = jest.fn()
const mockAnthropicCreate = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate
      }
    }
  }))
}))

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate
    }
  }))
}))

describe('AIComplianceComponent', () => {
  const name = 'Test Community'
  const description = 'A test community for testing purposes'
  const thumbnailBuffer = Buffer.from('fake-image-data')

  let aiCompliance: IAIComplianceComponent
  let mockResponse: any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('validateCommunityContent', () => {
    describe('when using OpenAI', () => {
      beforeEach(async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-api-key')
          return Promise.reject(new Error(`Unknown key: ${key}`))
        })
        mockConfig.getString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-api-key')
          if (key === 'OPENAI_API_URL') return Promise.resolve(undefined)
          if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
          return Promise.resolve(undefined)
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs
        })
      })

      describe('when content is compliant', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  violations: [],
                  warnings: [],
                  confidence: 0.95,
                  reasoning: 'Content is compliant with ethical standards'
                })
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should validate content successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(result.violations).toEqual([])
          expect(result.warnings).toEqual([])
          expect(result.confidence).toBe(0.95)
          expect(mockOpenAICreate).toHaveBeenCalledWith(
            expect.objectContaining({
              model: 'gpt-4o',
              messages: expect.arrayContaining([
                expect.objectContaining({ role: 'system' }),
                expect.objectContaining({ role: 'user', content: expect.stringContaining(name) })
              ])
            })
          )
          expect(mockAnthropicCreate).not.toHaveBeenCalled()
        })
      })

      describe('when content has violations', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: false,
                  violations: ['Contains inappropriate language'],
                  warnings: [],
                  confidence: 0.9,
                  reasoning: 'Content violates ethical standards'
                })
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should return violation details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(false)
          expect(result.violations).toEqual(['Contains inappropriate language'])
          expect(result.confidence).toBe(0.9)
          expect(mockAnthropicCreate).not.toHaveBeenCalled()
        })
      })

      describe('when content has warnings', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  violations: [],
                  warnings: ['Content is borderline but acceptable'],
                  confidence: 0.8,
                  reasoning: 'Content is compliant with minor concerns'
                })
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should return warning details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(result.warnings).toEqual(['Content is borderline but acceptable'])
          expect(result.confidence).toBe(0.8)
          expect(mockAnthropicCreate).not.toHaveBeenCalled()
        })
      })

      describe('when validating content with thumbnails', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  violations: [],
                  warnings: [],
                  confidence: 0.95,
                  reasoning: 'Content with thumbnail is compliant'
                })
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should handle thumbnail validation successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description, thumbnailBuffer })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledWith(
            expect.objectContaining({
              messages: expect.arrayContaining([
                expect.objectContaining({
                  content: expect.stringContaining('Thumbnail Image Data:')
                })
              ])
            })
          )
          expect(mockAnthropicCreate).not.toHaveBeenCalled()
        })
      })

      describe('when OpenAI returns empty content', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: null
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })

        it('should throw error for empty content', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('No content received from OpenAI API')
        })
      })

      describe('with custom configuration', () => {
        describe('when using custom API URLs', () => {
          beforeEach(async () => {
            mockConfig.getString.mockImplementation((key: string) => {
              if (key === 'OPENAI_API_KEY') return Promise.resolve('test-api-key')
              if (key === 'OPENAI_API_URL') return Promise.resolve('https://custom-openai-endpoint.com/v1')
              if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
              return Promise.resolve(undefined)
            })

            aiCompliance = await createAIComplianceComponent({
              config: mockConfig,
              logs: mockLogs
            })

            mockResponse = {
              choices: [{
                message: {
                  content: JSON.stringify({
                    isCompliant: true,
                    violations: [],
                    warnings: [],
                    confidence: 0.95,
                    reasoning: 'Content is compliant'
                  })
                }
              }]
            }
            mockOpenAICreate.mockResolvedValue(mockResponse)
          })

          it('should use custom endpoint', async () => {
            await aiCompliance.validateCommunityContent({ name, description })

            expect(mockOpenAICreate).toHaveBeenCalled()
          })
        })

        describe('when using custom models', () => {
          beforeEach(async () => {
            mockConfig.getString.mockImplementation((key: string) => {
              if (key === 'OPENAI_API_KEY') return Promise.resolve('test-api-key')
              if (key === 'OPENAI_API_URL') return Promise.resolve(undefined)
              if (key === 'OPENAI_MODEL') return Promise.resolve('gpt-4-turbo')
              return Promise.resolve(undefined)
            })

            aiCompliance = await createAIComplianceComponent({
              config: mockConfig,
              logs: mockLogs
            })

            mockResponse = {
              choices: [{
                message: {
                  content: JSON.stringify({
                    isCompliant: true,
                    violations: [],
                    warnings: [],
                    confidence: 0.95,
                    reasoning: 'Content is compliant'
                  })
                }
              }]
            }
            mockOpenAICreate.mockResolvedValue(mockResponse)
          })

          it('should use custom model', async () => {
            await aiCompliance.validateCommunityContent({ name, description })

            expect(mockOpenAICreate).toHaveBeenCalledWith(
              expect.objectContaining({
                model: 'gpt-4-turbo'
              })
            )
          })
        })
      })
    })

    describe('when OpenAI fails and falling back to Claude', () => {
      beforeEach(async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'CLAUDE_API_KEY') return Promise.resolve('test-claude-key')
          return Promise.reject(new Error(`Unknown key: ${key}`))
        })
        mockConfig.getString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'OPENAI_API_URL') return Promise.resolve(undefined)
          if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
          return Promise.resolve(undefined)
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs
        })
      })

      describe('when OpenAI throws an error', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(openaiError)
          
          mockResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                isCompliant: true,
                violations: [],
                warnings: [],
                confidence: 0.9,
                reasoning: 'Content validated by Claude'
              })
            }]
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should fallback to Claude successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
          expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
        })
      })

      describe('when OpenAI returns invalid JSON', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: 'This is not valid JSON'
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
          
          const claudeResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                isCompliant: true,
                violations: [],
                warnings: [],
                confidence: 0.9,
                reasoning: 'Content validated by Claude'
              })
            }]
          }
          mockAnthropicCreate.mockResolvedValue(claudeResponse)
        })

        it('should fallback to Claude for invalid responses', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
          expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
        })
      })

      describe('when OpenAI returns malformed responses', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  // Missing required fields
                  violations: []
                })
              }
            }]
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
          
          const claudeResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                isCompliant: true,
                violations: [],
                warnings: [],
                confidence: 0.9,
                reasoning: 'Content validated by Claude'
              })
            }]
          }
          mockAnthropicCreate.mockResolvedValue(claudeResponse)
        })

        it('should fallback to Claude for malformed responses', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
          expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
        })
      })

      describe('when OpenAI API has rate limit issues', () => {
        beforeEach(() => {
          const apiError = new Error('API rate limit exceeded')
          mockOpenAICreate.mockRejectedValue(apiError)
          
          mockResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                isCompliant: true,
                violations: [],
                warnings: [],
                confidence: 0.9,
                reasoning: 'Content validated by Claude'
              })
            }]
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should handle rate limit errors gracefully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
          expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('when using Claude directly', () => {
      beforeEach(async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') {
            return Promise.reject(new Error('OPENAI_API_KEY not found'))
          }
          if (key === 'CLAUDE_API_KEY') {
            return Promise.resolve('test-claude-key')
          }
          return Promise.reject(new Error(`Unknown key: ${key}`))
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs
        })
      })

      describe('when OpenAI key is not available', () => {
        beforeEach(() => {
          mockResponse = {
            content: [{
              type: 'text',
              text: JSON.stringify({
                isCompliant: true,
                violations: [],
                warnings: [],
                confidence: 0.9,
                reasoning: 'Content validated by Claude'
              })
            }]
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should use Claude successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })

          expect(result.isCompliant).toBe(true)
          expect(mockOpenAICreate).not.toHaveBeenCalled()
          expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
        })
      })

      describe('when Claude returns invalid content type', () => {
        beforeEach(() => {
          mockResponse = {
            content: [{
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'fake-image-data'
              }
            }]
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should throw error for invalid content type', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('No valid text content received from Claude API')
        })
      })

      describe('when Claude returns empty content', () => {
        beforeEach(() => {
          mockResponse = {
            content: []
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should throw error for empty content', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('No valid text content received from Claude API')
        })
      })
    })

    describe('when all providers fail', () => {
      beforeEach(async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'CLAUDE_API_KEY') return Promise.resolve('test-claude-key')
          return Promise.reject(new Error(`Unknown key: ${key}`))
        })
        mockConfig.getString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'OPENAI_API_URL') return Promise.resolve(undefined)
          if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
          return Promise.resolve(undefined)
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs
        })
      })

      describe('when both OpenAI and Claude fail completely', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API completely down')
          mockOpenAICreate.mockRejectedValue(openaiError)
          
          const claudeError = new Error('Claude API completely down')
          mockAnthropicCreate.mockRejectedValue(claudeError)
        })

        it('should throw error when all providers fail', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('Claude API completely down')
        })
      })

      describe('when OpenAI fails and Claude returns invalid response', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(openaiError)
          
          // Claude returns invalid JSON that can't be parsed
          mockResponse = {
            content: [{
              type: 'text',
              text: 'Invalid JSON response'
            }]
          }
          mockAnthropicCreate.mockResolvedValue(mockResponse)
        })

        it('should throw error when all providers fail', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('No valid JSON found in AI response')
        })
      })

      describe('when OpenAI fails and Claude throws non-Error exception', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(openaiError)
          
          // Claude throws a non-Error object
          const nonErrorException = { message: 'This is not an Error instance' }
          mockAnthropicCreate.mockRejectedValue(nonErrorException)
        })

        it('should handle non-Error exceptions gracefully', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('Unknown error')
        })
      })

      describe('when OpenAI fails and Claude throws undefined', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(openaiError)
          
          // Claude throws undefined
          mockAnthropicCreate.mockRejectedValue(undefined)
        })

        it('should handle undefined exceptions gracefully', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('Unknown error')
        })
      })
    })

    describe('when no providers are available', () => {
      it('should throw error during component creation', async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          return Promise.reject(new Error(`${key} not found`))
        })

        await expect(
          createAIComplianceComponent({
            config: mockConfig,
            logs: mockLogs
          })
        ).rejects.toThrow('No AI providers available - both OPENAI_API_KEY and CLAUDE_API_KEY are missing')
      })
    })

    describe('when only one provider is available', () => {
      beforeEach(async () => {
        mockConfig.requireString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'CLAUDE_API_KEY') return Promise.reject(new Error('CLAUDE_API_KEY not found'))
          return Promise.reject(new Error(`Unknown key: ${key}`))
        })
        mockConfig.getString.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return Promise.resolve('test-openai-key')
          if (key === 'OPENAI_API_URL') return Promise.resolve(undefined)
          if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
          return Promise.resolve(undefined)
        })

        aiCompliance = await createAIComplianceComponent({
          config: mockConfig,
          logs: mockLogs
        })
      })

      describe('when the single provider fails', () => {
        beforeEach(() => {
          const openaiError = new Error('OpenAI API completely down')
          mockOpenAICreate.mockRejectedValue(openaiError)
        })

        it('should throw the provider error when no fallback is available', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('OpenAI API completely down')
        })
      })
    })
  })
}) 
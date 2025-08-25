import { ComplianceValidationResult, createAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { mockConfig, mockLogs } from '../../mocks/components'
import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'

const mockOpenAICreate = jest.fn()

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

describe('AIComplianceComponent', () => {
  const name = 'Test Community'
  const description = 'A test community for testing purposes'
  const thumbnailBuffer = Buffer.from('fake-image-data')
  
  let aiCompliance: IAIComplianceComponent
  let mockResponse: any
  
  beforeEach(() => {
    mockConfig.requireString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') return Promise.resolve('test-api-key')
      return Promise.reject(new Error(`Unknown key: ${key}`))
    })
    
    mockConfig.getString.mockImplementation((key: string) => {
      if (key === 'ENV') return Promise.resolve('dev')
      if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })
  })
  
  describe("when the environment is not production", () => {
    beforeEach(() => {
      mockConfig.getString.mockImplementation((key: string) => {
        if (key === 'ENV') return Promise.resolve('dev')
        if (key === 'OPENAI_MODEL') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })
    })
    
    it("should return a mock response every time", async () => {
      const aiCompliance = await createAIComplianceComponent({
        config: mockConfig,
        logs: mockLogs
      })
      
      const result = await aiCompliance.validateCommunityContent({ name, description })
      
      expect(result).toEqual({
        isCompliant: true,
        issues: [],
        warnings: [],
        confidence: 1,
        reasoning: 'Non-production environment'
      })
    })
  })
  
  describe("when the environment is production", () => {
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
            logs: mockLogs
          })
          
          expect(aiCompliance).toBeDefined()
          expect(mockConfig.requireString).toHaveBeenCalledWith('OPENAI_API_KEY')
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
            logs: mockLogs
          })
          
          expect(aiCompliance).toBeDefined()
        })
      })
      
      describe('and OPENAI_API_KEY is missing', () => {
        beforeEach(() => {
          mockConfig.requireString.mockImplementation((key: string) => {
            if (key === 'OPENAI_API_KEY') return Promise.reject(new Error('OPENAI_API_KEY not found'))
            return Promise.resolve(undefined)
          })
        })
        
        it('should throw error', async () => {
          await expect(
            createAIComplianceComponent({
              config: mockConfig,
              logs: mockLogs
            })
          ).rejects.toThrow('OPENAI_API_KEY not found')
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
          logs: mockLogs
        })
      })
      
      describe('and content is compliant', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  issues: [],
                  warnings: [],
                  confidence: 0.95,
                  reasoning: 'Content is compliant with ethical standards'
                })
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 150,
              total_tokens: 650
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should validate content successfully', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })
          
          expect(result.isCompliant).toBe(true)
          expect(result.issues).toEqual([])
          expect(result.warnings).toEqual([])
          expect(result.confidence).toBe(0.95)
          expect(result.reasoning).toBe('Content is compliant with ethical standards')
        })
        
        it('should call OpenAI with correct parameters', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          
          expect(mockOpenAICreate).toHaveBeenCalledWith(
            expect.objectContaining({
              model: 'gpt-5-nano',
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'ComplianceValidationResult',
                  schema: expect.any(Object)
                }
              },
              messages: expect.arrayContaining([
                expect.objectContaining({ 
                  role: 'system', 
                  content: expect.stringContaining('Decentraland compliance expert') 
                }),
                expect.objectContaining({ 
                  role: 'user', 
                  content: expect.arrayContaining([
                    expect.objectContaining({
                      type: 'text',
                      text: expect.stringContaining(name)
                    })
                  ])
                })
              ])
            })
          )
        })
        
        it('should log usage information', async () => {
          await aiCompliance.validateCommunityContent({ name, description })
          
          expect(mockLogs.getLogger).toHaveBeenCalledWith('ai-compliance')
        })
      })
      
      describe('and content has compliance issues', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: false,
                  issues: ['Contains inappropriate language', 'Promotes illegal activities'],
                  warnings: ['Content may be borderline'],
                  confidence: 0.85,
                  reasoning: 'Content violates ethical standards'
                })
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 200,
              total_tokens: 700
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should return violation details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })
          
          expect(result.isCompliant).toBe(false)
          expect(result.issues).toEqual(['Contains inappropriate language', 'Promotes illegal activities'])
          expect(result.warnings).toEqual(['Content may be borderline'])
          expect(result.confidence).toBe(0.85)
          expect(result.reasoning).toBe('Content violates ethical standards')
        })
      })
      
      describe('and content has warnings but is compliant', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  issues: [],
                  warnings: ['Content is borderline but acceptable'],
                  confidence: 0.8,
                  reasoning: 'Content is compliant with minor concerns'
                })
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 180,
              total_tokens: 680
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should return warning details', async () => {
          const result = await aiCompliance.validateCommunityContent({ name, description })
          
          expect(result.isCompliant).toBe(true)
          expect(result.warnings).toEqual(['Content is borderline but acceptable'])
          expect(result.confidence).toBe(0.8)
        })
      })
      
      describe('and validating content with thumbnails', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  issues: [],
                  warnings: [],
                  confidence: 0.95,
                  reasoning: 'Content with thumbnail is compliant'
                })
              }
            }],
            usage: {
              prompt_tokens: 800,
              completion_tokens: 150,
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
              messages: expect.arrayContaining([
                expect.objectContaining({
                  content: expect.arrayContaining([
                    expect.objectContaining({
                      type: 'image_url',
                      image_url: expect.objectContaining({
                        url: expect.stringContaining('data:image/png;base64,')
                      })
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
            choices: [{
              message: {
                content: null
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 0,
              total_tokens: 500
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should throw error for empty content', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('No content received from OpenAI API')
        })
      })
      
      describe('and OpenAI returns invalid JSON', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: 'This is not valid JSON'
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 50,
              total_tokens: 550
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should throw error for invalid JSON', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('Invalid JSON response from OpenAI API')
        })
      })
      
      describe('and OpenAI returns malformed response structure', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  // Missing required fields
                  issues: []
                  // warnings, confidence, reasoning missing
                })
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 100,
              total_tokens: 600
            }
          }
          mockOpenAICreate.mockResolvedValue(mockResponse)
        })
        
        it('should throw error for malformed response', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('Invalid response structure from OpenAI API')
        })
      })
      
      describe('and OpenAI API throws an error', () => {
        beforeEach(() => {
          const apiError = new Error('OpenAI API error')
          mockOpenAICreate.mockRejectedValue(apiError)
        })
        
        it('should propagate the error', async () => {
          await expect(
            aiCompliance.validateCommunityContent({ name, description })
          ).rejects.toThrow('OpenAI API error')
        })
      })
      
      describe('and OpenAI API returns usage information', () => {
        beforeEach(() => {
          mockResponse = {
            choices: [{
              message: {
                content: JSON.stringify({
                  isCompliant: true,
                  issues: [],
                  warnings: [],
                  confidence: 0.95,
                  reasoning: 'Content is compliant'
                })
              }
            }],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 150,
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
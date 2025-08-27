import { createAIContentValidatorComponent } from '../../../src/adapters/ai-content-validator'
import { IAIContentValidatorComponent } from '../../../src/adapters/ai-content-validator'
import OpenAI from 'openai'

jest.mock('openai')

describe.skip('AIContentValidatorComponent', () => {
  let aiContentValidator: IAIContentValidatorComponent
  let mockCreateModeration: jest.MockedFunction<any>
  let mockApiKey: string
  let mockConfig: any
  let mockLogger: any

  beforeEach(async () => {
    jest.clearAllMocks()
    
    mockApiKey = 'test-api-key'
    
    mockConfig = {
      getString: jest.fn().mockResolvedValue(mockApiKey),
      getNumber: jest.fn(),
      requireString: jest.fn(),
      requireNumber: jest.fn()
    }
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    mockCreateModeration = jest.fn()
    const mockOpenAI = {
      moderations: {
        create: mockCreateModeration
      }
    }

    ;(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI as any)

    aiContentValidator = await createAIContentValidatorComponent({
      config: mockConfig,
      logs: { getLogger: () => mockLogger }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('validateContent', () => {
    const mockRequest = {
      title: 'Test Community',
      description: 'This is a test community description'
    }

    describe('when API key is not configured', () => {
      beforeEach(async () => {
        jest.clearAllMocks()
        
        const configWithoutKey = {
          getString: jest.fn().mockResolvedValue(undefined),
          getNumber: jest.fn(),
          requireString: jest.fn(),
          requireNumber: jest.fn()
        }
        
        aiContentValidator = await createAIContentValidatorComponent({
          config: configWithoutKey,
          logs: { getLogger: () => mockLogger }
        })
      })

      it('should return true and log a warning', async () => {
        const result = await aiContentValidator.validateContent(mockRequest)

        expect(result).toBe(true)
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'AI content validation not configured, allowing content by default'
        )
      })
    })

    describe('when validating text-only content', () => {
      it('should return true for appropriate content', async () => {
        const mockResponse = {
          model: 'omni-moderation-latest',
          results: [
            {
              flagged: false,
              categories: {
                sexual: false,
                hate: false,
                harassment: false,
                'self-harm': false,
                'sexual/minors': false,
                'hate/threatening': false,
                'violence/graphic': false,
                'self-harm/intent': false,
                'self-harm/instructions': false,
                'harassment/threatening': false,
                violence: false
              }
            }
          ]
        }

        mockCreateModeration.mockResolvedValue(mockResponse as any)

        const result = await aiContentValidator.validateContent(mockRequest)

        expect(result).toBe(true)
        expect(mockCreateModeration).toHaveBeenCalledWith({
          model: 'omni-moderation-latest',
          input: [
            {
              type: 'text',
              text: 'Title: Test Community\n\nDescription: This is a test community description'
            }
          ]
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Content validation result', {
          isAppropriate: 'yes',
          flaggedCategories: 'none',
          model: 'omni-moderation-latest'
        })
      })

      it('should return false for inappropriate content', async () => {
        const mockResponse = {
          model: 'omni-moderation-latest',
          results: [
            {
              flagged: true,
              categories: {
                sexual: false,
                hate: true,
                harassment: false,
                'self-harm': false,
                'sexual/minors': false,
                'hate/threatening': false,
                'violence/graphic': false,
                'self-harm/intent': false,
                'self-harm/instructions': false,
                'harassment/threatening': false,
                violence: false
              }
            }
          ]
        }

        mockCreateModeration.mockResolvedValue(mockResponse as any)

        const result = await aiContentValidator.validateContent(mockRequest)

        expect(result).toBe(false)
        expect(mockLogger.info).toHaveBeenCalledWith('Content validation result', {
          isAppropriate: 'no',
          flaggedCategories: 'hate',
          model: 'omni-moderation-latest'
        })
      })
    })

    describe('when validating content with image', () => {
      const mockRequestWithImage = {
        ...mockRequest,
        image: 'base64encodedimagecontent'
      }

      it('should include image in the moderation request', async () => {
        const mockResponse = {
          model: 'omni-moderation-latest',
          results: [
            {
              flagged: false,
              categories: {
                sexual: false,
                hate: false,
                harassment: false,
                'self-harm': false,
                'sexual/minors': false,
                'hate/threatening': false,
                'violence/graphic': false,
                'self-harm/intent': false,
                'self-harm/instructions': false,
                'harassment/threatening': false,
                violence: false
              }
            }
          ]
        }

        mockCreateModeration.mockResolvedValue(mockResponse as any)

        const result = await aiContentValidator.validateContent(mockRequestWithImage)

        expect(result).toBe(true)
        expect(mockCreateModeration).toHaveBeenCalledWith({
          model: 'omni-moderation-latest',
          input: [
            {
              type: 'text',
              text: 'Title: Test Community\n\nDescription: This is a test community description'
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/jpeg;base64,base64encodedimagecontent'
              }
            }
          ]
        })
      })

      it('should return false if image is flagged', async () => {
        const mockResponse = {
          model: 'omni-moderation-latest',
          results: [
            {
              flagged: true,
              categories: {
                sexual: true,
                hate: false,
                harassment: false,
                'self-harm': false,
                'sexual/minors': false,
                'hate/threatening': false,
                'violence/graphic': false,
                'self-harm/intent': false,
                'self-harm/instructions': false,
                'harassment/threatening': false,
                violence: false
              }
            }
          ]
        }

        mockCreateModeration.mockResolvedValue(mockResponse as any)

        const result = await aiContentValidator.validateContent(mockRequestWithImage)

        expect(result).toBe(false)
        expect(mockLogger.info).toHaveBeenCalledWith('Content validation result', {
          isAppropriate: 'no',
          flaggedCategories: 'sexual',
          model: 'omni-moderation-latest'
        })
      })
    })

    describe('when OpenAI API throws an error', () => {
      it('should return true and log the error', async () => {
        const error = new Error('OpenAI API error')
        mockCreateModeration.mockRejectedValue(error)

        const result = await aiContentValidator.validateContent(mockRequest)

        expect(result).toBe(true)
        expect(mockLogger.error).toHaveBeenCalledWith('Error validating content with OpenAI API', {
          error: 'OpenAI API error',
          stack: error.stack
        })
      })
    })

    describe('when multiple categories are flagged', () => {
      it('should list all flagged categories', async () => {
        const mockResponse = {
          model: 'omni-moderation-latest',
          results: [
            {
              flagged: true,
              categories: {
                sexual: false,
                hate: true,
                harassment: true,
                'self-harm': false,
                'sexual/minors': false,
                'hate/threatening': false,
                'violence/graphic': false,
                'self-harm/intent': false,
                'self-harm/instructions': false,
                'harassment/threatening': false,
                violence: true
              }
            }
          ]
        }

        mockCreateModeration.mockResolvedValue(mockResponse as any)

        const result = await aiContentValidator.validateContent(mockRequest)

        expect(result).toBe(false)
        expect(mockLogger.info).toHaveBeenCalledWith('Content validation result', {
          isAppropriate: 'no',
          flaggedCategories: 'hate, harassment, violence',
          model: 'omni-moderation-latest'
        })
      })
    })
  })
})
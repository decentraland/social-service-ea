import { createCommunityComplianceValidatorComponent, ICommunityComplianceValidatorComponent } from '../../../src/logic/community/compliance-validator'
import { createAIComplianceMock, createLogsMockedComponent } from '../../mocks/components'
import { CommunityComplianceError } from '../../../src/logic/community/errors'
import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('CommunityComplianceValidator', () => {
  let aiComplianceMock: jest.Mocked<IAIComplianceComponent>
  let logsMock: jest.Mocked<ILoggerComponent>
  let complianceValidator: ICommunityComplianceValidatorComponent

  beforeEach(() => {
    aiComplianceMock = createAIComplianceMock({})
    logsMock = createLogsMockedComponent()

    complianceValidator = createCommunityComplianceValidatorComponent({
      aiCompliance: aiComplianceMock,
      logs: logsMock
    })
  })
  
  describe('validateCommunityContent', () => {
    describe('when content is compliant', () => {
      beforeEach(() => {
        aiComplianceMock.validateCommunityContent.mockResolvedValue({
          isCompliant: true,
          violations: [],
          warnings: [],
          confidence: 1,
          reasoning: 'This community is compliant'
        })
      })

      it('should pass validation successfully', async () => {
        const name = 'Friendly Gaming Community'
        const description = 'A welcoming community for gamers to connect and play together'
        
        const result = await complianceValidator.validateCommunityContent({ name, description })

        expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
          name,
          description,
          thumbnailBuffer: undefined
        })
        
        expect(result).toBeUndefined()
      })
    })

    describe('when content has warnings but is still compliant', () => {
      beforeEach(() => {
        aiComplianceMock.validateCommunityContent.mockResolvedValue({
          isCompliant: true,
          violations: [],
          warnings: ['Content is borderline but acceptable'],
          confidence: 0.8,
          reasoning: 'Content is compliant with minor concerns'
        })
      })

      it('should pass validation with warnings', async () => {
        const name = 'A'.repeat(101) // Very long name
        const description = 'A'.repeat(1001) // Very long description
        
        const result = await complianceValidator.validateCommunityContent({ name, description })

        expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
          name,
          description,
          thumbnailBuffer: undefined
        })
        
        expect(result).toBeUndefined()
      })
    })

    describe('when content violates community guidelines', () => {
      beforeEach(() => {
        aiComplianceMock.validateCommunityContent.mockResolvedValue({
          isCompliant: false,
          violations: ['Contains hate speech and promotes violence'],
          warnings: [],
          confidence: 0.9,
          reasoning: 'Content violates community guidelines'
        })
      })
      
      it('should throw CommunityComplianceError', async () => {
        const name = 'Hate Speech Community'
        const description = 'A community for spreading hate and violence'
        
        await expect(
          complianceValidator.validateCommunityContent({ name, description })
        ).rejects.toThrow(CommunityComplianceError)

        expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
          name,
          description,
          thumbnailBuffer: undefined
        })
      })
    })
    
    describe('when validating content with thumbnails', () => {
      beforeEach(() => {
        aiComplianceMock.validateCommunityContent.mockResolvedValue({
          isCompliant: true,
          violations: [],
          warnings: [],
          confidence: 0.95,
          reasoning: 'Content with thumbnail is compliant'
        })
      })

      it('should handle thumbnail validation successfully', async () => {
        const name = 'Test Community'
        const description = 'Test description'
        const thumbnail = Buffer.from('fake-image-data')
        
        const result = await complianceValidator.validateCommunityContent({ name, description, thumbnailBuffer: thumbnail })

        expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
          name,
          description,
          thumbnailBuffer: thumbnail,
        })
        
        expect(result).toBeUndefined()
      })
    })
    
    describe('when AI compliance service fails', () => {
      let failingValidator: ICommunityComplianceValidatorComponent

      beforeEach(() => {
        const failingAiCompliance = {
          async validateCommunityContent() {
            throw new Error('AI service unavailable')
          }
        }
        
        failingValidator = createCommunityComplianceValidatorComponent({
          aiCompliance: failingAiCompliance,
          logs: logsMock
        })
      })
      
      it('should handle failures gracefully and throw CommunityComplianceError', async () => {
        await expect(
          failingValidator.validateCommunityContent({ name: 'Test', description: 'Test description' })
        ).rejects.toThrow(CommunityComplianceError)
      })
    })
  })
}) 
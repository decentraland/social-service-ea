import { createCommunityComplianceValidatorComponent } from '../../../src/logic/community/compliance-validator'
import { createAIComplianceMock } from '../../mocks/components/ai-compliance'
import { createLogsMockedComponent } from '../../mocks/components'
import { CommunityComplianceError } from '../../../src/logic/community/errors'

describe('CommunityComplianceValidatorComponent', () => {
  const aiComplianceMock = createAIComplianceMock()
  const logsMock = createLogsMockedComponent()
  
  const complianceValidator = createCommunityComplianceValidatorComponent({
    aiCompliance: aiComplianceMock,
    logs: logsMock
  })
  
  beforeEach(() => {
    jest.clearAllMocks()
  })
  
  describe('validateCommunityCreation', () => {
    it('should pass validation for compliant content', async () => {
      const name = 'Friendly Gaming Community'
      const description = 'A welcoming community for gamers to connect and play together'
      
      await expect(
        complianceValidator.validateCommunityCreation(name, description)
      ).resolves.not.toThrow()
    })
    
    it('should pass validation with warnings', async () => {
      const name = 'A'.repeat(101) // Very long name
      const description = 'A'.repeat(1001) // Very long description
      
      await expect(
        complianceValidator.validateCommunityCreation(name, description)
      ).resolves.not.toThrow()
    })
    
    it('should throw CommunityComplianceError for violating content', async () => {
      const name = 'Hate Speech Community'
      const description = 'A community for spreading hate and violence'
      
      await expect(
        complianceValidator.validateCommunityCreation(name, description)
      ).rejects.toThrow(CommunityComplianceError)
    })
    
    it('should handle thumbnail validation', async () => {
      const name = 'Test Community'
      const description = 'Test description'
      const thumbnail = Buffer.from('fake-image-data')
      
      await expect(
        complianceValidator.validateCommunityCreation(name, description, thumbnail)
      ).resolves.not.toThrow()
    })
  })
  
  describe('validateCommunityUpdate', () => {
    it('should pass when no fields are being updated', async () => {
      await expect(
        complianceValidator.validateCommunityUpdate()
      ).resolves.not.toThrow()
    })
    
    it('should validate only updated fields', async () => {
      const newName = 'Updated Community Name'
      
      await expect(
        complianceValidator.validateCommunityUpdate(newName)
      ).resolves.not.toThrow()
    })
    
    it('should validate thumbnail updates', async () => {
      const thumbnail = Buffer.from('new-thumbnail-data')
      
      await expect(
        complianceValidator.validateCommunityUpdate(undefined, undefined, thumbnail)
      ).resolves.not.toThrow()
    })
    
    it('should throw error for violating updates', async () => {
      const newName = 'Violence Community'
      
      await expect(
        complianceValidator.validateCommunityUpdate(newName)
      ).rejects.toThrow(CommunityComplianceError)
    })
  })
  
  describe('error handling', () => {
    it('should handle AI compliance service failures gracefully', async () => {
      // Mock the AI compliance to throw an error
      const failingAiCompliance = {
        async validateCommunityContent() {
          throw new Error('AI service unavailable')
        }
      }
      
      const failingValidator = createCommunityComplianceValidatorComponent({
        aiCompliance: failingAiCompliance,
        logs: logsMock
      })
      
      await expect(
        failingValidator.validateCommunityCreation('Test', 'Test description')
      ).rejects.toThrow(CommunityComplianceError)
    })
  })
}) 
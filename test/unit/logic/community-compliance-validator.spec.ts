import {
  createCommunityComplianceValidatorComponent,
  ICommunityComplianceValidatorComponent
} from '../../../src/logic/community/compliance-validator'
import { createAIComplianceMock, createLogsMockedComponent } from '../../mocks/components'
import { CommunityNotCompliantError } from '../../../src/logic/community/errors'
import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createFeatureFlagsMockComponent } from '../../mocks/components/feature-flags'
import { IFeatureFlagsAdapter } from '../../../src/adapters/feature-flags'

describe('CommunityComplianceValidator', () => {
  let aiComplianceMock: jest.Mocked<IAIComplianceComponent>
  let logsMock: jest.Mocked<ILoggerComponent>
  let featureFlagsMock: jest.Mocked<IFeatureFlagsAdapter>
  let complianceValidator: ICommunityComplianceValidatorComponent

  beforeEach(() => {
    aiComplianceMock = createAIComplianceMock({})
    logsMock = createLogsMockedComponent()
    featureFlagsMock = createFeatureFlagsMockComponent({})

    complianceValidator = createCommunityComplianceValidatorComponent({
      aiCompliance: aiComplianceMock,
      featureFlags: featureFlagsMock,
      logs: logsMock
    })
  })

  describe('when validating community content', () => {
    describe('and compliance validation feature flag is disabled', () => {
      beforeEach(() => {
        featureFlagsMock.isEnabled.mockReturnValue(false)
      })

      it('should skip validation', async () => {
        const name = 'Friendly Gaming Community'
        const description = 'A welcoming community for gamers to connect and play together'

        const result = await complianceValidator.validateCommunityContent({ name, description })

        expect(aiComplianceMock.validateCommunityContent).not.toHaveBeenCalled()
        expect(result).toBeUndefined()
      })
    })

    describe('and compliance validation feature flag is enabled', () => {
      beforeEach(() => {
        featureFlagsMock.isEnabled.mockReturnValue(true)
      })

      describe('and no content is provided', () => {
        it('should skip validation when no fields are provided', async () => {
          const result = await complianceValidator.validateCommunityContent({})

          expect(aiComplianceMock.validateCommunityContent).not.toHaveBeenCalled()
          expect(result).toBeUndefined()
        })
      })

      describe('and only name is provided', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 1
          })
        })

        it('should validate only the name field', async () => {
          const name = 'Friendly Gaming Community'

          const result = await complianceValidator.validateCommunityContent({ name })

          expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
            name,
            description: undefined,
            thumbnailBuffer: undefined
          })

          expect(result).toBeUndefined()
        })
      })

      describe('and only description is provided', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 1
          })
        })

        it('should validate only the description field', async () => {
          const description = 'A welcoming community for gamers to connect and play together'

          const result = await complianceValidator.validateCommunityContent({ description })

          expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
            name: undefined,
            description,
            thumbnailBuffer: undefined
          })

          expect(result).toBeUndefined()
        })
      })

      describe('and only thumbnail is provided', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 1
          })
        })

        it('should validate only the thumbnail field', async () => {
          const thumbnail = Buffer.from('fake-image-data')

          const result = await complianceValidator.validateCommunityContent({ thumbnailBuffer: thumbnail })

          expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
            name: undefined,
            description: undefined,
            thumbnailBuffer: thumbnail
          })

          expect(result).toBeUndefined()
        })
      })

      describe('and content is compliant', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 1
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

      describe('and content has warnings but is still compliant', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 0.8
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

      describe('and content violates community guidelines', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: false,
            issues: {
              name: ['Contains hate speech'],
              description: ['Promotes violence'],
              image: []
            },
            confidence: 0.9
          })
        })

        it('should throw CommunityNotCompliantError', async () => {
          const name = 'Hate Speech Community'
          const description = 'A community for spreading hate and violence'

          await expect(complianceValidator.validateCommunityContent({ name, description })).rejects.toThrow(
            CommunityNotCompliantError
          )

          expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
            name,
            description,
            thumbnailBuffer: undefined
          })
        })
      })

      describe('and validating content with thumbnails', () => {
        beforeEach(() => {
          aiComplianceMock.validateCommunityContent.mockResolvedValue({
            isCompliant: true,
            issues: {
              name: [],
              description: [],
              image: []
            },
            confidence: 0.95
          })
        })

        it('should handle thumbnail validation successfully', async () => {
          const name = 'Test Community'
          const description = 'Test description'
          const thumbnail = Buffer.from('fake-image-data')

          const result = await complianceValidator.validateCommunityContent({
            name,
            description,
            thumbnailBuffer: thumbnail
          })

          expect(aiComplianceMock.validateCommunityContent).toHaveBeenCalledWith({
            name,
            description,
            thumbnailBuffer: thumbnail
          })

          expect(result).toBeUndefined()
        })
      })

      describe('and AI compliance service fails', () => {
        let failingValidator: ICommunityComplianceValidatorComponent

        beforeEach(() => {
          const failingAiCompliance = {
            async validateCommunityContent() {
              throw new Error('AI service unavailable')
            }
          }

          failingValidator = createCommunityComplianceValidatorComponent({
            aiCompliance: failingAiCompliance,
            featureFlags: featureFlagsMock,
            logs: logsMock
          })
        })

        it('should propagate the original error', async () => {
          await expect(
            failingValidator.validateCommunityContent({ name: 'Test', description: 'Test description' })
          ).rejects.toThrow('AI service unavailable')
        })
      })
    })
  })
})

import { IAIComplianceComponent } from '../../../src/adapters/ai-compliance'

export function createAIComplianceMock({
  validateCommunityContent = jest.fn()
}: Partial<jest.Mocked<IAIComplianceComponent>>): jest.Mocked<IAIComplianceComponent> {
  return {
    validateCommunityContent
  }
}

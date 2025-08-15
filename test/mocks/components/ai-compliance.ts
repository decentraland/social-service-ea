import { IAIComplianceComponent, ComplianceValidationResult } from '../../../src/adapters/ai-compliance'

export function createAIComplianceMock(): IAIComplianceComponent {
  return {
    async validateCommunityContent(
      name: string,
      description: string,
      thumbnailBuffer?: Buffer
    ): Promise<ComplianceValidationResult> {
      // Mock implementation for testing
      // In a real test, you might want to test different scenarios
      
      // Check for obvious violations
      const violations: string[] = []
      const warnings: string[] = []
      
      // Simple rule-based validation for testing
      if (name.toLowerCase().includes('hate') || name.toLowerCase().includes('violence')) {
        violations.push('Community name contains inappropriate content')
      }
      
      if (description.toLowerCase().includes('illegal') || description.toLowerCase().includes('drugs')) {
        violations.push('Community description contains inappropriate content')
      }
      
      if (name.length > 100) {
        warnings.push('Community name is very long')
      }
      
      if (description.length > 1000) {
        warnings.push('Community description is very long')
      }
      
      const isCompliant = violations.length === 0
      const confidence = isCompliant ? 0.95 : 0.85
      
      return {
        isCompliant,
        violations,
        warnings,
        confidence,
        reasoning: isCompliant 
        ? 'Content appears to comply with Decentraland Code of Ethics'
        : 'Content violates Decentraland Code of Ethics standards'
      }
    }
  }
} 
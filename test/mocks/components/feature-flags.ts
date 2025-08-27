import { IFeatureFlagsAdapter } from '../../../src/adapters/feature-flags'

export function createFeatureFlagsMockComponent({
  isEnabled = jest.fn(),
  getVariants = jest.fn()
}: Partial<jest.Mocked<IFeatureFlagsAdapter>>): jest.Mocked<IFeatureFlagsAdapter> {
  return {
    isEnabled,
    getVariants
  }
}

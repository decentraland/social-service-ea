import { IFeatureFlagsAdapter } from '../../../src/adapters/feature-flags'

export function createFeatureFlagsMockComponent({
  isEnabled = jest.fn()
}: Partial<jest.Mocked<IFeatureFlagsAdapter>>): jest.Mocked<IFeatureFlagsAdapter> {
  return {
    isEnabled
  }
}

import { IFeaturesComponent } from '@well-known-components/features-component'

export function createFeaturesMockComponent({
  getIsFeatureEnabled = jest.fn(),
  getFeatureVariant = jest.fn(),
  getEnvFeature = jest.fn()
}: Partial<jest.Mocked<IFeaturesComponent>>): jest.Mocked<IFeaturesComponent> {
  return {
    getIsFeatureEnabled,
    getFeatureVariant,
    getEnvFeature
  }
}

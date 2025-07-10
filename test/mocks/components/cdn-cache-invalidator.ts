import { ICdnCacheInvalidatorComponent } from '../../../src/types'

export const mockCdnCacheInvalidator: jest.Mocked<ICdnCacheInvalidatorComponent> = {
  invalidateThumbnail: jest.fn()
}

export function createMockCdnCacheInvalidatorComponent(
  overrides: Partial<jest.Mocked<ICdnCacheInvalidatorComponent>>
): jest.Mocked<ICdnCacheInvalidatorComponent> {
  return {
    invalidateThumbnail: jest.fn(),
    ...overrides
  }
}

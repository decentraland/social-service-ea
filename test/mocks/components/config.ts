import { IConfigComponent } from '@well-known-components/interfaces'

export const mockConfig: jest.Mocked<IConfigComponent> = {
  getNumber: jest.fn(),
  getString: jest.fn(),
  requireNumber: jest.fn(),
  requireString: jest.fn()
}

export function createMockConfigComponent(
  overrides: Partial<jest.Mocked<IConfigComponent>>
): jest.Mocked<IConfigComponent> {
  return {
    getNumber: jest.fn(),
    getString: jest.fn(),
    requireNumber: jest.fn(),
    requireString: jest.fn(),
    ...overrides
  }
}

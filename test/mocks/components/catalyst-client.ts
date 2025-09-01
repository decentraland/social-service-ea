import { ICatalystClientComponent } from '../../../src/types'

export const mockCatalystClient: jest.Mocked<ICatalystClientComponent> = {
  getProfiles: jest.fn(),
  getProfile: jest.fn(),
  getOwnedNames: jest.fn()
}

export const createMockCatalystClient = (): jest.Mocked<ICatalystClientComponent> => ({
  getProfile: jest.fn(),
  getProfiles: jest.fn(),
  getOwnedNames: jest.fn()
})

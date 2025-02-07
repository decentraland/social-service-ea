import { ICatalystClientComponent } from '../../../src/types'

export const mockCatalystClient: jest.Mocked<ICatalystClientComponent> = {
  getProfiles: jest.fn(),
  getProfile: jest.fn()
}

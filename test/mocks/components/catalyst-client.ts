import { ICatalystClientComponent } from '../../../src/types'

export const mockCatalystClient: jest.Mocked<ICatalystClientComponent> = {
  getOwnedNames: jest.fn()
}

export const createMockCatalystClient = (): jest.Mocked<ICatalystClientComponent> => ({
  getOwnedNames: jest.fn()
})

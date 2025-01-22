import { ICatalystClient } from '../../../src/types'

export const mockCatalystClient: jest.Mocked<ICatalystClient> = {
  getEntitiesByPointers: jest.fn()
}

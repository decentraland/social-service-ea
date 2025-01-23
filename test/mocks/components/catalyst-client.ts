import { ICatalystClientComponent } from '../../../src/types'

export const mockCatalystClient: jest.Mocked<ICatalystClientComponent> = {
  getEntitiesByPointers: jest.fn(),
  getEntityByPointer: jest.fn()
}

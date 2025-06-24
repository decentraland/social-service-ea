import { IStorageComponent } from '../../../src/types'

export function createS3ComponentMock(): jest.Mocked<IStorageComponent> {
  return {
    storeFile: jest.fn(),
    exists: jest.fn()
  }
}

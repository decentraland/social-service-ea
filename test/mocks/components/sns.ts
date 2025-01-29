import { IPublisherComponent } from '../../../src/types'

export const mockSns: jest.Mocked<IPublisherComponent> = {
  publishMessage: jest.fn()
}

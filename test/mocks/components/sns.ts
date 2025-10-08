import { IPublisherComponent } from '../../../src/types'

export const mockSns: jest.Mocked<IPublisherComponent> = {
  publishMessage: jest.fn(),
  publishMessagesInBatch: jest.fn()
}

export const createSNSMockedComponent = ({
  publishMessage = jest.fn(),
  publishMessagesInBatch = jest.fn()
}: Partial<jest.Mocked<IPublisherComponent>>): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessage,
    publishMessagesInBatch
  }
}

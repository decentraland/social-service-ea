import { IPublisherComponent } from '../../../src/types'

export const mockSns: jest.Mocked<IPublisherComponent> = {
  publishMessage: jest.fn(),
  publishMessages: jest.fn()
}

export const createSNSMockedComponent = ({
  publishMessage = jest.fn(),
  publishMessages = jest.fn()
}: Partial<jest.Mocked<IPublisherComponent>>): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessage,
    publishMessages
  }
}

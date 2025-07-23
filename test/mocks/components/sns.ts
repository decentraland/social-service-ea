import { IPublisherComponent } from '../../../src/types'

export const mockSns: jest.Mocked<IPublisherComponent> = {
  publishMessage: jest.fn()
}

export const createSNSMockedComponent = ({
  publishMessage = jest.fn()
}: Partial<jest.Mocked<IPublisherComponent>>): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessage
  }
}

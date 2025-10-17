import { IPublisherComponent } from '@dcl/sns-component'

export const createSNSMockedComponent = ({
  publishMessage = jest.fn(),
  publishMessages = jest.fn()
}: Partial<jest.Mocked<IPublisherComponent>>): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessage,
    publishMessages
  }
}

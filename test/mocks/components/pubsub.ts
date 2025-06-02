import { IPubSubComponent } from '../../../src/types'

export const mockPubSub: jest.Mocked<IPubSubComponent> = {
  start: jest.fn(),
  stop: jest.fn(),
  subscribeToChannel: jest.fn(),
  publishInChannel: jest.fn()
}

export function createMockedPubSubComponent({
  start = jest.fn(),
  stop = jest.fn(),
  subscribeToChannel = jest.fn(),
  publishInChannel = jest.fn()
}: Partial<jest.Mocked<IPubSubComponent>>): jest.Mocked<IPubSubComponent> {
  return {
    start,
    stop,
    subscribeToChannel,
    publishInChannel
  }
}

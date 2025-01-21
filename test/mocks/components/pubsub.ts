import { IPubSubComponent } from '../../../src/types'

export const mockPubSub: jest.Mocked<IPubSubComponent> = {
  start: jest.fn(),
  stop: jest.fn(),
  subscribeToChannel: jest.fn(),
  publishInChannel: jest.fn()
}

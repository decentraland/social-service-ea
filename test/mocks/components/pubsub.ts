import { IPubSubComponent } from '../../../src/types'

export const mockPubSub: jest.Mocked<IPubSubComponent> = {
  start: jest.fn(),
  stop: jest.fn(),
  subscribeToFriendshipUpdates: jest.fn(),
  publishFriendshipUpdate: jest.fn()
}

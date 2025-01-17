import { IDatabaseComponent } from '../../../src/adapters/db'

export const mockDb: jest.Mocked<IDatabaseComponent> = {
  createFriendship: jest.fn(),
  updateFriendshipStatus: jest.fn(),
  getFriends: jest.fn(),
  getFriendsCount: jest.fn(),
  getMutualFriends: jest.fn(),
  getMutualFriendsCount: jest.fn(),
  getFriendship: jest.fn(),
  getLastFriendshipAction: jest.fn(),
  getLastFriendshipActionByUsers: jest.fn(),
  recordFriendshipAction: jest.fn(),
  getReceivedFriendshipRequests: jest.fn(),
  getSentFriendshipRequests: jest.fn(),
  executeTx: jest.fn()
}

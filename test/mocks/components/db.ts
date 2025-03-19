import { IDatabaseComponent } from '../../../src/types'

export const mockDb: jest.Mocked<IDatabaseComponent> = {
  createFriendship: jest.fn(),
  updateFriendshipStatus: jest.fn(),
  getFriends: jest.fn(),
  getFriendsCount: jest.fn(),
  getOnlineFriends: jest.fn(),
  getMutualFriends: jest.fn(),
  getMutualFriendsCount: jest.fn(),
  getFriendship: jest.fn(),
  getLastFriendshipActionByUsers: jest.fn(),
  recordFriendshipAction: jest.fn(),
  getReceivedFriendshipRequests: jest.fn(),
  getReceivedFriendshipRequestsCount: jest.fn(),
  getSentFriendshipRequests: jest.fn(),
  getBlockedUsers: jest.fn(),
  getBlockedByUsers: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  blockUsers: jest.fn(),
  unblockUsers: jest.fn(),
  getSentFriendshipRequestsCount: jest.fn(),
  isFriendshipBlocked: jest.fn(),
  getSocialSettings: jest.fn(),
  upsertSocialSettings: jest.fn(),
  executeTx: jest.fn()
}

import { IFriendsComponent } from '../../../src/logic/friends'

export function createFriendsMockedComponent({
  getFriendsProfiles = jest.fn(),
  getFriendsWithoutProfiles = jest.fn(),
  blockUser = jest.fn(),
  getBlockedUsers = jest.fn(),
  getBlockingStatus = jest.fn(),
  getFriendshipStatus = jest.fn(),
  getMutualFriendsProfiles = jest.fn(),
  getMutualFriendsWithoutProfiles = jest.fn(),
  getPendingFriendshipRequests = jest.fn(),
  getPendingFriendshipRequestsWithoutProfiles = jest.fn(),
  getSentFriendshipRequests = jest.fn(),
  getSentFriendshipRequestsWithoutProfiles = jest.fn(),
  unblockUser = jest.fn(),
  upsertFriendship = jest.fn(),
  upsertFriendshipWithoutProfiles = jest.fn()
}: Partial<jest.Mocked<IFriendsComponent>> = {}): jest.Mocked<IFriendsComponent> {
  return {
    getFriendsProfiles,
    getFriendsWithoutProfiles,
    blockUser,
    getBlockedUsers,
    getBlockingStatus,
    getFriendshipStatus,
    getMutualFriendsProfiles,
    getMutualFriendsWithoutProfiles,
    getPendingFriendshipRequests,
    getPendingFriendshipRequestsWithoutProfiles,
    getSentFriendshipRequests,
    getSentFriendshipRequestsWithoutProfiles,
    unblockUser,
    upsertFriendship,
    upsertFriendshipWithoutProfiles
  }
}

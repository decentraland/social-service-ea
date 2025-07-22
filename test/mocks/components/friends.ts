import { IFriendsComponent } from '../../../src/logic/friends'

export function createFriendsMockedComponent({
  getFriendsProfiles = jest.fn(),
  blockUser = jest.fn(),
  getBlockedUsers = jest.fn(),
  getBlockingStatus = jest.fn(),
  getFriendshipStatus = jest.fn()
}: Partial<jest.Mocked<IFriendsComponent>> = {}): jest.Mocked<IFriendsComponent> {
  return {
    getFriendsProfiles,
    blockUser,
    getBlockedUsers,
    getBlockingStatus,
    getFriendshipStatus
  }
}

import { IFriendsComponent } from '../../../src/logic/friends'

export function createFriendsMockedComponent({
  getFriendsProfiles = jest.fn(),
  blockUser = jest.fn(),
  unblockUser = jest.fn()
}: Partial<jest.Mocked<IFriendsComponent>> = {}): jest.Mocked<IFriendsComponent> {
  return {
    getFriendsProfiles,
    blockUser,
    unblockUser
  }
}

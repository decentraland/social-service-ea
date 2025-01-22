import { Friend } from '../../src/types'

export const createMockFriend = (address: string): Friend => ({
  address
})

export function parseExpectedFriends(contentServerUrl: string) {
  return (address: string) => ({
    address,
    name: `Profile name ${address}`,
    hasClaimedName: true,
    profilePictureUrl: `${contentServerUrl}/contents/bafybeiasdfqwer`
  })
}

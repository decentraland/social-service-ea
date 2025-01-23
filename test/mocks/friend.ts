import { Entity } from '@dcl/schemas'
import { Friend } from '../../src/types'
import { getProfileAvatar } from '../../src/logic/profiles'

export const createMockFriend = (address: string): Friend => ({
  address
})

export function parseExpectedFriends(profileImagesUrl: string) {
  return (profile: Entity) => ({
    address: getProfileAvatar(profile).userId,
    name: getProfileAvatar(profile).name,
    hasClaimedName: true,
    profilePictureUrl: `${profileImagesUrl}/entities/${profile.id}/face.png`
  })
}

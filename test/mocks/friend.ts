import { User } from '../../src/types'
import {
  getProfileHasClaimedName,
  getProfileName,
  getProfilePictureUrl,
  getProfileUserId
} from '../../src/logic/profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export const createMockFriend = (address: string): User => ({
  address
})

export function parseExpectedFriends() {
  return (profile: Pick<Profile, 'avatars'>) => ({
    address: getProfileUserId(profile),
    name: getProfileName(profile),
    hasClaimedName: getProfileHasClaimedName(profile),
    profilePictureUrl: getProfilePictureUrl(profile)
  })
}

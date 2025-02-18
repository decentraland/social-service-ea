import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileName, getProfileHasClaimedName, getProfileUserId, getProfilePictureUrl } from './profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

function getOrDefault<T>(fn: (profile: Profile) => T, profile: Profile, defaultValue: T): T {
  try {
    return fn(profile)
  } catch (error) {
    return defaultValue
  }
}

export function parseProfileToFriend(profile: Profile): FriendProfile {
  const name = getOrDefault(getProfileName, profile, '')
  const userId = getOrDefault(getProfileUserId, profile, '')
  const hasClaimedName = getOrDefault(getProfileHasClaimedName, profile, false)
  const profilePictureUrl = getOrDefault(getProfilePictureUrl, profile, '') // TODO: use a default profile picture

  return {
    address: userId,
    name,
    hasClaimedName,
    profilePictureUrl
  }
}

export function parseProfilesToFriends(profiles: Profile[]): FriendProfile[] {
  return profiles.map((profile) => parseProfileToFriend(profile))
}

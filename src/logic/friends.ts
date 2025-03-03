import { UserProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileName, getProfileHasClaimedName, getProfileUserId, getProfilePictureUrl } from './profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export function parseProfileToUserProfile(profile: Profile): UserProfile {
  const name = getProfileName(profile)
  const userId = getProfileUserId(profile)
  const hasClaimedName = getProfileHasClaimedName(profile)
  const profilePictureUrl = getProfilePictureUrl(profile)

  return {
    address: userId,
    name,
    hasClaimedName,
    profilePictureUrl
  }
}

export function parseProfilesToUserProfiles(profiles: Profile[]): UserProfile[] {
  return profiles.map((profile) => parseProfileToUserProfile(profile))
}

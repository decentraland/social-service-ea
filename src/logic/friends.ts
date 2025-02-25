import { Profile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileName, getProfileHasClaimedName, getProfileUserId, getProfilePictureUrl } from './profiles'
import { Profile as LambdasProfile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export function parseCatalystProfileToProfile(profile: LambdasProfile): Profile {
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

export function parseCatalystProfilesToProfiles(profiles: LambdasProfile[]): Profile[] {
  return profiles.map((profile) => parseCatalystProfileToProfile(profile))
}

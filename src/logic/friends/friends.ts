import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileInfo } from '../profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export function parseProfileToFriend(profile: Profile): FriendProfile {
  const { name, nameColor, userId, hasClaimedName, profilePictureUrl } = getProfileInfo(profile)

  return {
    address: userId,
    name,
    nameColor,
    hasClaimedName,
    profilePictureUrl
  }
}

export function parseProfilesToFriends(profiles: Profile[]): FriendProfile[] {
  return profiles.map((profile) => parseProfileToFriend(profile))
}

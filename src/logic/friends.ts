import { User } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Entity } from '@dcl/schemas'
import { getProfileAvatar, getProfilePictureUrl } from './profiles'
import { normalizeAddress } from '../utils/address'

export function parseProfilesToFriends(profiles: Entity[], contentServerUrl: string): User[] {
  return profiles.map((profile) => {
    const { userId, name, hasClaimedName } = getProfileAvatar(profile)

    return {
      address: normalizeAddress(userId),
      name,
      hasClaimedName,
      profilePictureUrl: getProfilePictureUrl(contentServerUrl, profile)
    }
  })
}

import {
  Profile,
  ProfileAvatarsItem,
  ProfileAvatarsItemNameColor
} from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { normalizeAddress } from '../utils/address'

export function getProfileAvatarItem(profile: Pick<Profile, 'avatars'>): ProfileAvatarsItem {
  const [avatar] = profile.avatars ?? []

  if (!avatar) throw new Error('Missing profile avatar')

  return avatar
}

export function getProfileName(profile: Pick<Profile, 'avatars'>): string {
  const { name, unclaimedName } = getProfileAvatarItem(profile)

  if (!name && !unclaimedName) throw new Error('Missing profile avatar name')

  return name || unclaimedName!
}

export function getProfileNameColor(profile: Pick<Profile, 'avatars'>): ProfileAvatarsItemNameColor | undefined {
  const { nameColor } = getProfileAvatarItem(profile)

  return nameColor
}

export function getProfileUserId(profile: Pick<Profile, 'avatars'>): string {
  const { userId } = getProfileAvatarItem(profile)

  if (!userId) throw new Error('Missing profile avatar userId')

  return normalizeAddress(userId)
}

export function getProfileHasClaimedName(profile: Pick<Profile, 'avatars'>): boolean {
  const { hasClaimedName } = getProfileAvatarItem(profile)
  return hasClaimedName ?? false
}

export function getProfilePictureUrl(profile: Pick<Profile, 'avatars'>): string {
  const { avatar } = getProfileAvatarItem(profile)
  const { face256 } = avatar?.snapshots ?? {}

  if (!face256) throw new Error('Missing profile avatar picture url')

  return face256
}

export function getProfileInfo(profile: Profile) {
  const name = getProfileName(profile)
  const nameColor = getProfileNameColor(profile)
  const userId = getProfileUserId(profile)
  const hasClaimedName = getProfileHasClaimedName(profile)
  const profilePictureUrl = getProfilePictureUrl(profile)

  return {
    name,
    nameColor,
    userId,
    hasClaimedName,
    profilePictureUrl
  }
}

/**
 * Extracts a minimal Profile structure containing only the properties we actually use.
 * This reduces Redis storage size while maintaining full compatibility with existing code.
 */
export function extractMinimalProfile(profile: Profile): Profile | null {
  try {
    const avatar = getProfileAvatarItem(profile)
    const {
      userId,
      name,
      nameColor,
      unclaimedName,
      hasClaimedName = false,
      avatar: { snapshots: { face256 } = {} } = {}
    } = avatar

    if (!userId || (!name && !unclaimedName) || !face256) {
      return null
    }

    return {
      avatars: [
        {
          userId,
          name,
          nameColor,
          unclaimedName,
          hasClaimedName,
          avatar: {
            snapshots: {
              face256
            }
          }
        }
      ]
    } as Profile
  } catch (error) {
    return null
  }
}

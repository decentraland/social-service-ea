import { Profile, ProfileAvatarsItem } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { normalizeAddress } from '../utils/address'

export function getProfileAvatarItem(profile: Pick<Profile, 'avatars'>): ProfileAvatarsItem {
  const [avatar] = profile.avatars ?? []

  if (!avatar) throw new Error('Missing profile avatar')

  return avatar
}

export function getProfileName(profile: Pick<Profile, 'avatars'>): string {
  const { name } = getProfileAvatarItem(profile)

  if (!name) throw new Error('Missing profile avatar name')

  return name
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
  const userId = getProfileUserId(profile)
  const hasClaimedName = getProfileHasClaimedName(profile)
  const profilePictureUrl = getProfilePictureUrl(profile)

  return {
    name,
    userId,
    hasClaimedName,
    profilePictureUrl
  }
}

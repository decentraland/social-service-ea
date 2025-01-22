import { Entity } from '@dcl/schemas'

type Avatar = {
  userId: string
  name: string
  hasClaimedName: boolean
  snapshots: {
    face256: string
  }
}

export function getProfileAvatar(profile: Entity): Avatar {
  const [avatar] = profile.metadata.avatars

  if (!avatar) throw new Error('Missing profile avatar')

  return avatar
}

export function getProfilePictureUrl(baseUrl: string, profile: Entity): string {
  if (!baseUrl) throw new Error('Missing baseUrl for profile picture')

  const avatar = getProfileAvatar(profile)
  const hash = avatar?.snapshots.face256

  if (!hash) throw new Error('Missing snapshot hash for profile picture')

  return `${baseUrl}/contents/${hash}`
}

import { Entity } from '@dcl/schemas'

type Avatar = {
  userId: string
  name: string
  hasClaimedName: boolean
  snapshots: {
    face256: string
  }
}

export function getProfileAvatar(profile: Pick<Entity, 'metadata'>): Avatar {
  const [avatar] = profile.metadata.avatars

  if (!avatar) throw new Error('Missing profile avatar')

  return avatar
}

export function getProfilePictureUrl(baseUrl: string, { id }: Pick<Entity, 'id'>): string {
  if (!baseUrl) throw new Error('Missing baseUrl for profile picture')

  return `${baseUrl}/entities/${id}/face.png`
}

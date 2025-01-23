import { Entity } from '@dcl/schemas'
import { FriendshipRequest } from '../../src/types'
import { getProfileAvatar } from '../../src/logic/profiles'
import { FriendshipRequestResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

/**
 * Creates a mock friendship request from given parameters.
 */
export const createMockFriendshipRequest = (
  id: string,
  address: string,
  timestamp: string,
  message?: string
): FriendshipRequest => ({
  id,
  address,
  timestamp,
  metadata: message ? { message } : undefined
})

/**
 * Creates the expected mapped response for a friendship request.
 */
export const createMockExpectedFriendshipRequest = (
  id: string,
  address: string,
  profile: Entity,
  createdAt?: string,
  message: string = '',
  profileImagesUrl: string = 'https://profile-images.decentraland.org'
): FriendshipRequestResponse => ({
  id,
  friend: {
    address,
    name: getProfileAvatar(profile).name,
    hasClaimedName: getProfileAvatar(profile).hasClaimedName,
    profilePictureUrl: `${profileImagesUrl}/entities/${profile.id}/face.png`
  },
  createdAt: createdAt ? new Date(createdAt).getTime() : new Date().getTime(),
  message
})

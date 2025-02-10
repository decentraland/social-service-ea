import { Entity } from '@dcl/schemas'
import { FriendshipRequest } from '../../src/types'
import { getProfileHasClaimedName, getProfileName, getProfilePictureUrl } from '../../src/logic/profiles'
import { FriendshipRequestResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

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
  profile: Pick<Profile, 'avatars'>,
  createdAt?: string,
  message: string = ''
): FriendshipRequestResponse => ({
  id,
  friend: {
    address,
    name: getProfileName(profile),
    hasClaimedName: getProfileHasClaimedName(profile),
    profilePictureUrl: getProfilePictureUrl(profile)
  },
  createdAt: createdAt ? new Date(createdAt).getTime() : new Date().getTime(),
  message
})

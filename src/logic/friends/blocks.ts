import {
  BlockedUserProfile,
  BlockUpdate
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileInfo, getProfileUserId } from '../profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { BlockedUserWithDate, SubscriptionEventsEmitter } from '../../types'

/**
 * Builds the response entry for a blocked address whose profile could not be resolved.
 *
 * The block is real, so the address is what the client needs; the display fields are simply absent.
 */
export function parseAddressToBlockedUser(address: string, blockedAt?: Date): BlockedUserProfile {
  return {
    address: address.toLowerCase(),
    name: '',
    nameColor: undefined,
    hasClaimedName: false,
    profilePictureUrl: '',
    blockedAt: blockedAt?.getTime()
  }
}

export function parseProfileToBlockedUser(profile: Profile, blockedAt?: Date): BlockedUserProfile {
  const { name, nameColor, userId, hasClaimedName, profilePictureUrl } = getProfileInfo(profile)

  return {
    address: userId,
    name,
    nameColor,
    hasClaimedName,
    profilePictureUrl,
    blockedAt: blockedAt?.getTime()
  }
}

export function parseProfilesToBlockedUsers(
  profiles: Profile[],
  blockedUsers: BlockedUserWithDate[]
): BlockedUserProfile[] {
  const blockedAtByAddress = new Map(blockedUsers.map((user) => [user.address, user.blocked_at]))
  return profiles.map((profile) => {
    const userId = getProfileUserId(profile)
    const blockedAt = blockedAtByAddress.get(userId)
    return parseProfileToBlockedUser(profile, blockedAt)
  })
}

export function parseEmittedUpdateToBlockUpdate(
  update: Pick<SubscriptionEventsEmitter['blockUpdate'], 'blockerAddress' | 'isBlocked'>
): BlockUpdate | null {
  const { blockerAddress, isBlocked } = update
  return {
    address: blockerAddress,
    isBlocked
  }
}

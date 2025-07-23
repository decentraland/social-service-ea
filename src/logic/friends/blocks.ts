import {
  BlockedUserProfile,
  BlockUpdate
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getProfileInfo, getProfileUserId } from '../profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { BlockedUserWithDate, SubscriptionEventsEmitter } from '../../types'

export function parseProfileToBlockedUser(profile: Profile, blockedAt?: Date): BlockedUserProfile {
  const { name, userId, hasClaimedName, profilePictureUrl } = getProfileInfo(profile)

  return {
    address: userId,
    name,
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

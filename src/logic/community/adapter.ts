import { EthAddress } from '@dcl/schemas'
import { Action, CommunityRole, FriendshipAction } from '../../types/entities'
import { parseProfilesToFriends } from '../friends'
import { getProfileUserId, getProfileInfo, getProfileName } from '../profiles'
import {
  Community,
  CommunityWithUserInformation,
  CommunityWithMembersCount,
  CommunityWithMembersCountAndFriends,
  CommunityPublicInformation,
  WithCommunityOwner
} from './types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { getFriendshipRequestStatus } from '../friendships'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

// Types for our transformation system
type Resource<T> = T | T[]
type AdapterContext = {
  getProfiles: (addresses: string[]) => Promise<Profile[]>
  getThumbnail: (id: string) => Promise<string | undefined>
}

// Higher-order type for transformations
type Transform<T, R> = (context: TransformContext) => (resource: Resource<T>) => Promise<Resource<R>>
type PureTransform<T, R> = (resource: Resource<T>) => Resource<R>

function createCommunityAdapter() {
  return (context: AdapterContext) => {
    const { getProfiles, getThumbnail } = context

    const transform: Transform<Community, Community> = (context) => (resource) => {
      return Promise.resolve(resource)
    }

    return { transform }
  }
}

// ============================================================================
// UTILITY FUNCTIONS - Our own pipe and compose implementations
// ============================================================================

/**
 * Pipe function that applies a series of functions to a value
 * @param value - The initial value
 * @param fns - Array of functions to apply
 * @returns The result of applying all functions
 */
const pipe = <T, R>(value: T, ...fns: ((x: any) => any)[]): R => {
  return fns.reduce((acc, fn) => fn(acc), value) as unknown as R
}

/**
 * Compose function that creates a new function from a series of functions
 * @param fns - Array of functions to compose
 * @returns A new function that applies all functions in sequence
 */
const compose = <T, R>(...fns: ((x: any) => any)[]): ((value: T) => R) => {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value) as unknown as R
}

// ============================================================================
// INTERNAL TRANSFORMATION FUNCTIONS (with* functions)
// ============================================================================

/**
 * Adds normalized members count to a community
 */
const withNormalizedMembersCount = <T extends { membersCount: number | string }>(
  community: T
): T & { membersCount: number } => {
  return {
    ...community,
    membersCount: Number(community.membersCount)
  }
}

/**
 * Adds live status to a community
 */
const withLiveStatus = <T extends Community>(community: T): T & { isLive: boolean } => {
  return {
    ...community,
    isLive: false // TODO: calculate this in the future
  }
}

/**
 * Adds owner information to a community
 */
const withOwnerInformation = <T extends Community>(community: T, ownerProfile?: Profile): WithCommunityOwner<T> => {
  const { ownerAddress, ...rest } = community

  return {
    ...rest,
    owner: {
      address: ownerAddress,
      name: ownerProfile ? getProfileName(ownerProfile) : ''
    }
  }
}

/**
 * Adds friends information to a community
 */
const withFriendsInformation = (
  community: CommunityWithMembersCountAndFriends & { isLive: boolean },
  profilesMap: Map<string, Profile>
): CommunityWithUserInformation => {
  const friendsProfiles = community.friends.map((friend) => profilesMap.get(friend)).filter(Boolean) as Profile[]
  const friends = parseProfilesToFriends(friendsProfiles)

  return {
    ...community,
    friends
  }
}

/**
 * Adds thumbnail information to a community (pure function)
 */
const withThumbnailInformation = <T extends Community>(
  community: T,
  thumbnail?: string
): T & { thumbnails?: { raw: string } } => {
  return {
    ...community,
    thumbnails: thumbnail ? { raw: thumbnail } : undefined
  }
}

/**
 * Adds thumbnail information to multiple communities (pure function)
 */
const withThumbnailsInformation = <T extends Community>(
  communities: T[],
  thumbnails: Map<string, string>
): (T & { thumbnails?: { raw: string } })[] => {
  return communities.map((community) => {
    const thumbnail = thumbnails.get(community.id)
    return withThumbnailInformation(community, thumbnail)
  })
}

// ============================================================================
// COMPOSED TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transforms a community to its base form with normalized members count and live status
 */
const transformToBaseCommunity = <T extends { membersCount: number | string }>(
  community: T
): T & { membersCount: number; isLive: boolean } => {
  return pipe(community, withNormalizedMembersCount, withLiveStatus)
}

/**
 * Transforms a community to include user-specific information
 */
const transformToUserCommunity = (
  community: CommunityWithMembersCountAndFriends,
  profilesMap: Map<string, Profile>
): CommunityWithUserInformation => {
  return pipe(
    community,
    (c) => transformToBaseCommunity(c),
    (c) => withFriendsInformation(c, profilesMap)
  )
}

/**
 * Transforms a community to include public information
 */
const transformToPublicCommunity = (community: CommunityPublicInformation): CommunityPublicInformation => {
  return transformToBaseCommunity(community)
}

// ============================================================================
// EXPORTED TRANSFORMATION FUNCTIONS (Public API)
// ============================================================================

/**
 * Transforms a community with owner information and members count
 */
export const transformCommunityWithOwnerAndMembersCount = (
  community: Community & { role: CommunityRole },
  membersCount: number,
  ownerProfile: Profile
): WithCommunityOwner<CommunityWithMembersCount> => {
  return pipe(
    community,
    (c) => withOwnerInformation(c, ownerProfile),
    (c) => ({ ...c, membersCount })
  )
}

/**
 * Transforms a community to include user information
 */
export const transformCommunityWithUserInformation = (
  community: CommunityWithMembersCountAndFriends,
  profilesMap: Map<string, Profile>
): CommunityWithUserInformation => {
  return transformToUserCommunity(community, profilesMap)
}

/**
 * Transforms multiple communities to include user information and owner details
 */
export const transformCommunitiesWithUserInformation = (
  communities: CommunityWithMembersCountAndFriends[],
  friendsProfiles: Profile[],
  communitiesOwnersProfiles: Profile[]
): WithCommunityOwner<CommunityWithUserInformation>[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  const communitiesOwnersProfilesMap = new Map(
    communitiesOwnersProfiles.map((profile) => [getProfileUserId(profile), profile])
  )

  return communities.map((community) =>
    pipe(
      community,
      (c) => transformToUserCommunity(c, profilesMap),
      (c) => withOwnerInformation(c, communitiesOwnersProfilesMap.get(community.ownerAddress))
    )
  )
}

/**
 * Transforms a community to public information format
 */
export const transformCommunityToPublicInformation = (
  community: CommunityPublicInformation
): CommunityPublicInformation => {
  return transformToPublicCommunity(community)
}

/**
 * Transforms multiple communities to public information format with owner details
 */
export const transformCommunitiesToPublicInformation = (
  communities: CommunityPublicInformation[],
  communitiesOwnersProfiles: Profile[]
): WithCommunityOwner<CommunityPublicInformation>[] => {
  const communitiesOwnersProfilesMap = new Map(
    communitiesOwnersProfiles.map((profile) => [getProfileUserId(profile), profile])
  )

  return communities.map((community) =>
    pipe(community, transformToPublicCommunity, (c) =>
      withOwnerInformation(c, communitiesOwnersProfilesMap.get(community.ownerAddress)!)
    )
  )
}

/**
 * Transforms member profiles with additional profile information
 */
export const transformMemberProfilesWithInformation = <
  T extends { memberAddress: EthAddress; lastFriendshipAction?: Action; actingUser?: EthAddress },
  R extends {
    profilePictureUrl: string
    hasClaimedName: boolean
    name: string
    friendshipStatus: FriendshipStatus
  }
>(
  userAddress: EthAddress | undefined,
  members: T[],
  profiles: Profile[]
): (T & R)[] => {
  const profileMap = new Map(profiles.map((profile) => [getProfileUserId(profile), profile]))

  return members
    .map((member) => {
      const memberProfile = profileMap.get(member.memberAddress)
      if (!memberProfile) return undefined

      const { lastFriendshipAction, actingUser } = member
      let friendshipStatus: FriendshipStatus = FriendshipStatus.NONE

      if (lastFriendshipAction && actingUser && userAddress) {
        const friendshipAction: Pick<FriendshipAction, 'action' | 'acting_user'> = {
          action: lastFriendshipAction,
          acting_user: actingUser
        }
        friendshipStatus = getFriendshipRequestStatus(friendshipAction, userAddress)
      }

      const { profilePictureUrl, hasClaimedName, name } = getProfileInfo(memberProfile)

      return {
        ...member,
        profilePictureUrl,
        hasClaimedName,
        name,
        friendshipStatus
      }
    })
    .filter((member): member is T & R => member !== undefined)
}

/**
 * Transforms a single community with thumbnail information (pure function)
 */
export const transformCommunityWithThumbnail = <T extends Community>(
  community: T,
  thumbnail?: string
): T & { thumbnails?: { raw: string } } => {
  return withThumbnailInformation(community, thumbnail)
}

/**
 * Transforms multiple communities with thumbnail information (pure function)
 */
export const transformCommunitiesWithThumbnails = <T extends Community>(
  communities: T[],
  thumbnails: Map<string, string>
): (T & { thumbnails?: { raw: string } })[] => {
  return withThumbnailsInformation(communities, thumbnails)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a user is the owner of a community
 */
export const checkIsCommunityOwner = (community: Community, userAddress: string): boolean => {
  return community.ownerAddress.toLowerCase() === userAddress.toLowerCase()
}

// ============================================================================
// BACKWARDS COMPATIBILITY - Functions that match the old utils interface
// ============================================================================

// These functions maintain the same interface as the old utils for easy migration

export const isOwner = checkIsCommunityOwner

export const toCommunityWithMembersCountAndOwner = transformCommunityWithOwnerAndMembersCount

export const toCommunityWithUserInformation = transformCommunityWithUserInformation

export const toCommunityResults = transformCommunitiesWithUserInformation

export const toCommunityPublicInformation = transformCommunityToPublicInformation

export const toCommunitiesPublicInformation = transformCommunitiesToPublicInformation

export const mapMembersWithProfiles = transformMemberProfilesWithInformation

// Thumbnail transformations (pure functions)
export const toCommunityWithThumbnail = transformCommunityWithThumbnail

export const toCommunitiesWithThumbnails = transformCommunitiesWithThumbnails

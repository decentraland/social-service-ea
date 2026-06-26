import { EthAddress } from '@dcl/schemas'
import { Action, CommunityRole, FriendshipAction } from '../../types/entities'
import { parseProfilesToFriends } from '../friends'
import { getProfileUserId, getProfileInfo } from '../profiles'
import {
  Community,
  CommunityWithUserInformation,
  CommunityWithUserInformationAndVoiceChat,
  AggregatedCommunityWithMemberAndVoiceChatData,
  AggregatedCommunityWithMemberAndFriendsData,
  CommunityPublicInformation,
  CommunityPublicInformationWithVoiceChat,
  AggregatedCommunity,
  CommunityVoiceChatStatus,
  CommunityRequestType,
  CommunityPrivacyEnum,
  MemberProfileInfo,
  AggregatedCommunityV2,
  AggregatedCommunityWithMemberAndVoiceChatDataV2,
  CommunityWithUserInformationV2,
  CommunityWithUserInformationAndVoiceChatV2,
  CommunityPublicInformationV2,
  CommunityPublicInformationWithVoiceChatV2
} from './types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { getFriendshipRequestStatus } from '../friends'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export const isOwner = (community: Community, userAddress: string) => {
  return community.ownerAddress.toLowerCase() === userAddress.toLowerCase()
}

const withMembersCount = <T extends { membersCount: number | string }>(community: T): T & { membersCount: number } => {
  return {
    ...community,
    membersCount: Number(community.membersCount)
  }
}

const toBaseCommunity = <T extends { membersCount: number | string }>(community: T): T => {
  return {
    ...withMembersCount(community)
  }
}

/**
 * Resolves the voice chat status to expose for a community: the real status when voice
 * chat is visible to the caller (a public community, or any member of a private one) and
 * is actually active, otherwise a zeroed/inactive default. Shared by the v1 and v2 mappers.
 */
const resolveVoiceChatStatus = (
  community: { privacy: CommunityPrivacyEnum; role: CommunityRole },
  voiceChatStatus: CommunityVoiceChatStatus | null
): CommunityVoiceChatStatus => {
  const shouldIncludeVoiceChat =
    community.privacy !== CommunityPrivacyEnum.Private || community.role !== CommunityRole.None

  return shouldIncludeVoiceChat && !!voiceChatStatus
    ? voiceChatStatus
    : {
        isActive: false,
        participantCount: 0,
        moderatorCount: 0
      }
}

export const toCommunityWithMembersCount = (
  community: AggregatedCommunity & { role: CommunityRole },
  membersCount: number,
  voiceChatStatus: {
    isActive: boolean
    participantCount: number
    moderatorCount: number
  } | null
): AggregatedCommunityWithMemberAndVoiceChatData => {
  return withMembersCount({
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount,
    voiceChatStatus
  })
}

export const toCommunityWithUserInformation = (
  community: AggregatedCommunityWithMemberAndFriendsData,
  profilesMap: Map<string, Profile>
): CommunityWithUserInformation => {
  const friendsProfiles = community.friends.map((friend) => profilesMap.get(friend)).filter(Boolean) as Profile[]
  const friends = parseProfilesToFriends(friendsProfiles)

  return {
    ...toBaseCommunity(community),
    friends
  }
}

export const toCommunityWithUserInformationAndVoiceChat = (
  community: AggregatedCommunityWithMemberAndFriendsData,
  profilesMap: Map<string, Profile>,
  voiceChatStatus: CommunityVoiceChatStatus | null
): CommunityWithUserInformationAndVoiceChat => {
  const baseResult = toCommunityWithUserInformation(community, profilesMap)

  return {
    ...baseResult,
    voiceChatStatus: resolveVoiceChatStatus(community, voiceChatStatus)
  }
}

export const toCommunityResults = (
  communities: AggregatedCommunityWithMemberAndFriendsData[],
  friendsProfiles: Profile[]
): CommunityWithUserInformation[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  return communities.map((community) => toCommunityWithUserInformation(community, profilesMap))
}

export const toCommunityResultsWithVoiceChat = (
  communities: AggregatedCommunityWithMemberAndFriendsData[],
  friendsProfiles: Profile[],
  voiceChatStatuses: Record<string, CommunityVoiceChatStatus> | undefined
): CommunityWithUserInformationAndVoiceChat[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  const safeVoiceChatStatuses = voiceChatStatuses || {}
  return communities.map((community) =>
    toCommunityWithUserInformationAndVoiceChat(community, profilesMap, safeVoiceChatStatuses[community.id] || null)
  )
}

export const toPublicCommunity = (community: CommunityPublicInformation): CommunityPublicInformation => {
  return toBaseCommunity(community)
}

export const toPublicCommunityWithVoiceChat = (
  community: CommunityPublicInformation,
  voiceChatStatus: CommunityVoiceChatStatus | null
): CommunityPublicInformationWithVoiceChat => {
  return {
    ...toBaseCommunity(community),
    voiceChatStatus
  }
}

// ---- v2 (address-only) community mappers ----
// These mirror the v1 mappers above but never inflate the owner address into an owner
// name and keep mutual friends as plain addresses (`friends: string[]`). v2 community
// rows carry no `ownerName`, so nothing profile-derived ends up in the response.

export const toCommunityWithMembersCountV2 = (
  community: AggregatedCommunityV2 & { role: CommunityRole },
  membersCount: number,
  voiceChatStatus: CommunityVoiceChatStatus | null
): AggregatedCommunityWithMemberAndVoiceChatDataV2 => {
  return withMembersCount({
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount,
    voiceChatStatus
  })
}

export const toCommunityWithUserInformationV2 = (
  community: Omit<AggregatedCommunityWithMemberAndFriendsData, 'ownerName'>
): CommunityWithUserInformationV2 => {
  return {
    ...toBaseCommunity(community),
    friends: community.friends
  }
}

export const toCommunityWithUserInformationAndVoiceChatV2 = (
  community: Omit<AggregatedCommunityWithMemberAndFriendsData, 'ownerName'>,
  voiceChatStatus: CommunityVoiceChatStatus | null
): CommunityWithUserInformationAndVoiceChatV2 => {
  const baseResult = toCommunityWithUserInformationV2(community)

  return {
    ...baseResult,
    voiceChatStatus: resolveVoiceChatStatus(community, voiceChatStatus)
  }
}

export const toCommunityResultsWithVoiceChatV2 = (
  communities: Omit<AggregatedCommunityWithMemberAndFriendsData, 'ownerName'>[],
  voiceChatStatuses: Record<string, CommunityVoiceChatStatus> | undefined
): CommunityWithUserInformationAndVoiceChatV2[] => {
  const safeVoiceChatStatuses = voiceChatStatuses || {}
  return communities.map((community) =>
    toCommunityWithUserInformationAndVoiceChatV2(community, safeVoiceChatStatuses[community.id] || null)
  )
}

export const toPublicCommunityWithVoiceChatV2 = (
  community: CommunityPublicInformationV2,
  voiceChatStatus: CommunityVoiceChatStatus | null
): CommunityPublicInformationWithVoiceChatV2 => {
  return {
    ...toBaseCommunity(community),
    voiceChatStatus
  }
}

const computeFriendshipStatus = (
  member: { lastFriendshipAction?: Action; actingUser?: EthAddress },
  userAddress: EthAddress | undefined
): FriendshipStatus => {
  const { lastFriendshipAction, actingUser } = member

  if (lastFriendshipAction && actingUser && userAddress) {
    const friendshipAction: Pick<FriendshipAction, 'action' | 'acting_user'> = {
      action: lastFriendshipAction,
      acting_user: actingUser
    }
    return getFriendshipRequestStatus(friendshipAction, userAddress)
  }

  return FriendshipStatus.NONE
}

export const mapMembersWithProfiles = <
  T extends { memberAddress: EthAddress; lastFriendshipAction?: Action; actingUser?: EthAddress }
>(
  userAddress: EthAddress | undefined,
  members: T[],
  profiles: Profile[]
): (T & MemberProfileInfo)[] => {
  const profileMap = new Map(profiles.map((profile) => [getProfileUserId(profile), profile]))
  return members
    .map((member) => {
      const memberProfile = profileMap.get(member.memberAddress)
      const friendshipStatus = computeFriendshipStatus(member, userAddress)

      if (!memberProfile) {
        return undefined
      }

      const { profilePictureUrl, hasClaimedName, name, nameColor } = getProfileInfo(memberProfile)

      return {
        ...member,
        profilePictureUrl,
        hasClaimedName,
        name,
        ...(nameColor && { nameColor }),
        friendshipStatus
      } as T & MemberProfileInfo
    })
    .filter((member): member is T & MemberProfileInfo => member !== undefined)
}

/**
 * v2 mapper: attaches the friendship status to each member WITHOUT fetching any profile
 * and WITHOUT dropping members. Returns only the base entity plus `friendshipStatus`.
 * The internal `lastFriendshipAction`/`actingUser` fields (used only to derive the status)
 * are stripped so they don't leak into the address-only response.
 */
export const mapMembersWithFriendshipStatus = <
  T extends { memberAddress: EthAddress; lastFriendshipAction?: Action; actingUser?: EthAddress }
>(
  userAddress: EthAddress | undefined,
  members: T[]
): (T & { friendshipStatus: FriendshipStatus })[] => {
  return members.map((member) => {
    const friendshipStatus = computeFriendshipStatus(member, userAddress)
    const { lastFriendshipAction, actingUser, ...rest } = member
    return { ...rest, friendshipStatus } as T & { friendshipStatus: FriendshipStatus }
  })
}

export const getCommunityThumbnailPath = (communityId: string) => {
  return `/social/communities/${communityId}/raw-thumbnail.png`
}

export const parseRequestTypeFilter = (searchParams: URLSearchParams): CommunityRequestType | undefined => {
  const typeParam: string | null = searchParams.get('type')
  return typeParam === CommunityRequestType.Invite || typeParam === CommunityRequestType.RequestToJoin
    ? (typeParam as CommunityRequestType)
    : undefined
}

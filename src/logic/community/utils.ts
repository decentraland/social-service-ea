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
  CommunityRequestType
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
    voiceChatStatus
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

export const mapMembersWithProfiles = <
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
      const { lastFriendshipAction, actingUser } = member
      let friendshipStatus: FriendshipStatus = FriendshipStatus.NONE

      if (lastFriendshipAction && actingUser && userAddress) {
        const friendshipAction: Pick<FriendshipAction, 'action' | 'acting_user'> = {
          action: lastFriendshipAction,
          acting_user: actingUser
        }
        friendshipStatus = getFriendshipRequestStatus(friendshipAction, userAddress)
      }

      if (!memberProfile) {
        return undefined
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

export const getCommunityThumbnailPath = (communityId: string) => {
  return `/social/communities/${communityId}/raw-thumbnail.png`
}

export const parseRequestTypeFilter = (searchParams: URLSearchParams): CommunityRequestType | undefined => {
  const typeParam: string | null = searchParams.get('type')
  return typeParam === CommunityRequestType.Invite || typeParam === CommunityRequestType.RequestToJoin
    ? (typeParam as CommunityRequestType)
    : undefined
}

export const toCommunityWithThumbnail = <T extends Omit<Community, 'thumbnails'>>(
  community: T,
  thumbnail?: string
): T & { thumbnails?: { raw: string } } => {
  if (!thumbnail) return community

  return {
    ...community,
    thumbnails: {
      raw: thumbnail
    }
  }
}

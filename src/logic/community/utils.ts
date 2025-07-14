import { EthAddress } from '@dcl/schemas'
import { Action, CommunityRole, FriendshipAction } from '../../types/entities'
import { parseProfilesToFriends } from '../friends'
import { getProfileUserId, getProfileInfo } from '../profiles'
import {
  Community,
  CommunityWithUserInformation,
  CommunityWithMembersCount,
  CommunityWithMembersCountAndFriends,
  CommunityPublicInformation
} from './types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { getFriendshipRequestStatus } from '../friendships'
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

const toBaseCommunity = <T extends { membersCount: number | string }>(community: T): T & { isLive: boolean } => {
  return {
    ...withMembersCount(community),
    isLive: false // TODO: calculate this in the future
  }
}

export const toCommunityWithMembersCount = (
  community: Community & { role: CommunityRole },
  membersCount: number,
  voiceChatStatus: {
    isActive: boolean
    participantCount: number
    moderatorCount: number
  } | null
): CommunityWithMembersCount => {
  return withMembersCount({
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount,
    voiceChatStatus
  })
}

export const toCommunityWithUserInformation = (
  community: CommunityWithMembersCountAndFriends,
  profilesMap: Map<string, Profile>
): CommunityWithUserInformation => {
  const friendsProfiles = community.friends.map((friend) => profilesMap.get(friend)).filter(Boolean) as Profile[]
  const friends = parseProfilesToFriends(friendsProfiles)

  return {
    ...toBaseCommunity(community),
    friends
  }
}

export const toCommunityResults = (
  communities: CommunityWithMembersCountAndFriends[],
  friendsProfiles: Profile[]
): CommunityWithUserInformation[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  return communities.map((community) => toCommunityWithUserInformation(community, profilesMap))
}

export const toPublicCommunity = (community: CommunityPublicInformation): CommunityPublicInformation => {
  return toBaseCommunity(community)
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

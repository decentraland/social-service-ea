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

// TODO(refactor): this could follow a builder pattern to allow other components to append extra information to the community

export const isOwner = (community: Community, userAddress: string) => {
  return community.ownerAddress.toLowerCase() === userAddress.toLowerCase()
}

const withMembersCount = <T extends { membersCount: number | string }>(community: T): T & { membersCount: number } => {
  return {
    ...community,
    membersCount: Number(community.membersCount)
  }
}

const withCommunityOwner = <T extends Community>(community: T, ownerProfile?: Profile): WithCommunityOwner<T> => {
  const { ownerAddress, ...rest } = community

  return {
    ...rest,
    owner: {
      address: ownerAddress,
      name: ownerProfile ? getProfileName(ownerProfile) : ''
    }
  }
}

const toBaseCommunity = <T extends { membersCount: number | string }>(community: T): T & { isLive: boolean } => {
  return {
    ...withMembersCount(community),
    isLive: false // TODO: calculate this in the future
  }
}

export const toCommunityWithMembersCountAndOwner = (
  community: Community & { role: CommunityRole },
  membersCount: number,
  ownerProfile: Profile
): WithCommunityOwner<CommunityWithMembersCount> => {
  return withMembersCount({ ...withCommunityOwner(community, ownerProfile), membersCount })
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
  friendsProfiles: Profile[],
  communitiesOwnersProfiles: Profile[]
): WithCommunityOwner<CommunityWithUserInformation>[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  const communitiesOwnersProfilesMap = new Map(
    communitiesOwnersProfiles.map((profile) => [getProfileUserId(profile), profile])
  )
  return communities.map((community) =>
    withCommunityOwner(
      toCommunityWithUserInformation(community, profilesMap),
      communitiesOwnersProfilesMap.get(community.ownerAddress)
    )
  )
}

export const toCommunityPublicInformation = (community: CommunityPublicInformation): CommunityPublicInformation => {
  return toBaseCommunity(community)
}

export const toCommunitiesPublicInformation = (
  communities: CommunityPublicInformation[],
  communitiesOwnersProfiles: Profile[]
): WithCommunityOwner<CommunityPublicInformation>[] => {
  const communitiesOwnersProfilesMap = new Map(
    communitiesOwnersProfiles.map((profile) => [getProfileUserId(profile), profile])
  )
  return communities.map((community) =>
    withCommunityOwner(
      toCommunityPublicInformation(community),
      communitiesOwnersProfilesMap.get(community.ownerAddress)!
    )
  )
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

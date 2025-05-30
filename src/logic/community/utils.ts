import { parseProfilesToFriends } from '../friends'
import { getProfileUserId } from '../profiles'
import {
  Community,
  CommunityWithUserInformation,
  CommunityWithMembersCount,
  CommunityWithMembersCountAndFriends,
  CommunityPublicInformation
} from './types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

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

export const toCommunityWithMembersCount = (community: Community, membersCount: number): CommunityWithMembersCount => {
  return withMembersCount({
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount
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

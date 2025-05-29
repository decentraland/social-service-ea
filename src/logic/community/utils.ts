import { parseProfilesToFriends } from '../friends'
import { getProfileUserId } from '../profiles'
import { Community, CommunityResult, CommunityWithMembersCount, CommunityWithMembersCountAndFriends } from './types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export const isOwner = (community: Community, userAddress: string) => {
  return community.ownerAddress.toLowerCase() === userAddress.toLowerCase()
}

export const toCommunityWithMembersCount = (community: Community, membersCount: number): CommunityWithMembersCount => {
  return {
    ...community,
    ownerAddress: community.ownerAddress,
    membersCount: Number(membersCount)
  }
}

export const toCommunityResult = (
  community: CommunityWithMembersCountAndFriends,
  profilesMap: Map<string, Profile>
): CommunityResult => {
  const friendsProfiles = community.friends.map((friend) => profilesMap.get(friend)).filter(Boolean) as Profile[]
  const friends = parseProfilesToFriends(friendsProfiles)

  return {
    ...community,
    membersCount: Number(community.membersCount),
    friends,
    isLive: false // TODO: calculate this in the future
  }
}

export const toCommunityResults = (
  communities: CommunityWithMembersCountAndFriends[],
  friendsProfiles: Profile[]
): CommunityResult[] => {
  const profilesMap = new Map(friendsProfiles.map((profile) => [getProfileUserId(profile), profile]))
  return communities.map((community) => toCommunityResult(community, profilesMap))
}

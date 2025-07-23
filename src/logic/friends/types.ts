import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { BlockedUserWithDate, FriendshipRequest } from '../../types'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export type BlockedUser = {
  profile: Profile
  blockedAt: Date
}

export interface IFriendsComponent {
  blockUser(blockerAddress: string, blockedAddress: string): Promise<BlockedUser>
  getBlockedUsers(
    userAddress: string
  ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }>
  getBlockingStatus(userAddress: string): Promise<{ blockedUsers: string[]; blockedByUsers: string[] }>
  getFriendsProfiles(
    userAddress: EthAddress,
    pagination?: Pagination
  ): Promise<{ friendsProfiles: Profile[]; total: number }>
  getFriendshipStatus(loggedUserAddress: string, userAddress: string): Promise<FriendshipStatus>
  getMutualFriendsProfiles(
    requesterAddress: string,
    requestedAddress: string,
    pagination?: Pagination
  ): Promise<{ friendsProfiles: Profile[]; total: number }>
  getPendingFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }>
  getSentFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }>
  unblockUser(blockerAddress: string, blockedAddress: string): Promise<Profile>
}

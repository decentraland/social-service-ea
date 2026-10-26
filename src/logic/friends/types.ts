import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, BlockedUserWithDate, FriendshipAction, FriendshipRequest, User } from '../../types'

export type BlockedUser = {
  /** Null when the registry has no resolvable profile; the block still happened. */
  profile: Profile | null
  blockedAt: Date
}

/** A friendship request as the address-only endpoints return it: the other user's address, no profile. */
export type FriendshipRequestWithoutProfile = {
  id: string
  /** The other user: the sender of a received request, the receiver of a sent one. */
  address: string
  createdAt: number
  message?: string
}

export interface IFriendsComponent {
  blockUser(blockerAddress: string, blockedAddress: string): Promise<BlockedUser>
  /**
   * Reads one page of the caller's blocked users.
   *
   * The page is required: this returns a bounded page, never the full list, and an omitted
   * argument would quietly mean "the first default page" to a caller expecting everything.
   */
  getBlockedUsers(
    userAddress: string,
    pagination: Pagination
  ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }>
  getBlockingStatus(userAddress: string): Promise<{ blockedUsers: string[]; blockedByUsers: string[] }>
  getFriendsProfiles(
    userAddress: EthAddress,
    pagination?: Pagination
  ): Promise<{ friendsProfiles: Profile[]; total: number }>
  getFriendsWithoutProfiles(
    userAddress: EthAddress,
    pagination?: Pagination
  ): Promise<{ friends: User[]; total: number }>
  blockUser(blockerAddress: string, blockedAddress: string): Promise<BlockedUser>
  unblockUser(blockerAddress: string, blockedAddress: string): Promise<Profile | null>
  upsertFriendship(
    userAddress: EthAddress,
    friendAddress: EthAddress,
    action: Action,
    metadata: Record<string, string> | null
  ): Promise<{ friendshipRequest: FriendshipRequest; receiverProfile: Profile }>
  /**
   * Same checks, writes and updates as {@link IFriendsComponent.upsertFriendship}, without resolving
   * profiles for the response. The notification, which needs them, is sent in the background.
   */
  upsertFriendshipWithoutProfiles(
    userAddress: EthAddress,
    friendAddress: EthAddress,
    action: Action,
    metadata: Record<string, string> | null
  ): Promise<FriendshipRequest>
  getFriendshipStatus(loggedUserAddress: string, userAddress: string): Promise<FriendshipAction | undefined>
  getMutualFriendsProfiles(
    requesterAddress: string,
    requestedAddress: string,
    pagination?: Pagination
  ): Promise<{ friendsProfiles: Profile[]; total: number }>
  getMutualFriendsWithoutProfiles(
    requesterAddress: string,
    requestedAddress: string,
    pagination?: Pagination
  ): Promise<{ friends: User[]; total: number }>
  getPendingFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }>
  getPendingFriendshipRequestsWithoutProfiles(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; total: number }>
  getSentFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }>
  getSentFriendshipRequestsWithoutProfiles(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; total: number }>
}

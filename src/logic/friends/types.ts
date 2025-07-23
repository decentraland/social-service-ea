import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, FriendshipRequest } from '../../types'

export type BlockedUser = {
  profile: Profile
  blockedAt: Date
}

export interface IFriendsComponent {
  getFriendsProfiles(
    userAddress: EthAddress,
    pagination?: Pagination
  ): Promise<{ friendsProfiles: Profile[]; total: number }>
  blockUser(blockerAddress: string, blockedAddress: string): Promise<BlockedUser>
  unblockUser(blockerAddress: string, blockedAddress: string): Promise<Profile>
  upsertFriendship(
    userAddress: EthAddress,
    friendAddress: EthAddress,
    action: Action,
    metadata: Record<string, string> | null
  ): Promise<{ friendshipRequest: FriendshipRequest; receiverProfile: Profile }>
}

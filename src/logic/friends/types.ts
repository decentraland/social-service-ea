import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { EthAddress } from '@dcl/schemas'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { BlockedUserWithDate } from '../../types'

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
  getBlockedUsers(
    userAddress: string
  ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }>
}

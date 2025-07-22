import { EthAddress } from '@dcl/schemas'
import { Action, AppComponents, BlockedUserWithDate } from '../../types'
import { BlockedUser, IFriendsComponent } from './types'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { ProfileNotFoundError } from './errors'

export async function createFriendsComponent(
  components: Pick<AppComponents, 'friendsDb' | 'catalystClient' | 'pubsub'>
): Promise<IFriendsComponent> {
  const { friendsDb, catalystClient, pubsub } = components

  return {
    getFriendsProfiles: async (
      userAddress: EthAddress,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const [friends, total] = await Promise.all([
        friendsDb.getFriends(userAddress, { pagination, onlyActive: true }),
        friendsDb.getFriendsCount(userAddress, { onlyActive: true })
      ])

      const friendsProfiles = await catalystClient.getProfiles(friends.map((friend) => friend.address))

      return {
        friendsProfiles,
        total
      }
    },
    blockUser: async (blockerAddress: string, blockedAddress: string): Promise<BlockedUser> => {
      const profile = await catalystClient.getProfile(blockedAddress)

      if (!profile) {
        throw new ProfileNotFoundError(blockedAddress)
      }

      const { actionId, blockedAt } = await friendsDb.executeTx(async (tx) => {
        const { blocked_at: blockedAt } = await friendsDb.blockUser(blockerAddress, blockedAddress, tx)

        const friendship = await friendsDb.getFriendship([blockerAddress, blockedAddress], tx)
        if (!friendship) return { blockedAt }

        const [_, actionId] = await Promise.all([
          friendsDb.updateFriendshipStatus(friendship.id, false, tx),
          friendsDb.recordFriendshipAction(friendship.id, blockerAddress, Action.BLOCK, null, tx)
        ])

        return { actionId, blockedAt }
      })

      await Promise.all([
        actionId
          ? pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
              id: actionId,
              from: blockerAddress,
              to: blockedAddress,
              action: Action.BLOCK,
              timestamp: blockedAt.getTime()
            })
          : Promise.resolve(),
        pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
          blockerAddress,
          blockedAddress,
          isBlocked: true
        })
      ])

      return { profile, blockedAt }
    },
    getBlockedUsers: async (
      userAddress: string
    ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }> => {
      const blockedUsers = await friendsDb.getBlockedUsers(userAddress)
      const blockedAddresses = blockedUsers.map((user) => user.address)
      const profiles = await catalystClient.getProfiles(blockedAddresses)

      return {
        blockedUsers,
        blockedProfiles: profiles,
        total: blockedAddresses.length
      }
    },
    getBlockingStatus: async (userAddress: string): Promise<{ blockedUsers: string[]; blockedByUsers: string[] }> => {
      const [blockedUsers, blockedByUsers] = await Promise.all([
        friendsDb.getBlockedUsers(userAddress),
        friendsDb.getBlockedByUsers(userAddress)
      ])

      const blockedAddresses = blockedUsers.map((user) => user.address)
      const blockedByAddresses = blockedByUsers.map((user) => user.address)

      return {
        blockedUsers: blockedAddresses,
        blockedByUsers: blockedByAddresses
      }
    }
  }
}

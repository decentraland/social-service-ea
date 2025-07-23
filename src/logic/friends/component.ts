import { EthAddress } from '@dcl/schemas'
import { BlockedUserError, ProfileNotFoundError } from './errors'
import { getNewFriendshipStatus } from './friendships'
import { getProfileUserId } from '../profiles'
import { sendNotification, shouldNotify } from '../notifications'
import { Action, AppComponents, BlockedUserWithDate, FriendshipRequest } from '../../types'
import { BlockedUser, IFriendsComponent } from './types'
import { FriendshipStatus, Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { getFriendshipRequestStatus } from './friendships'

export async function createFriendsComponent(
  components: Pick<AppComponents, 'friendsDb' | 'catalystClient' | 'pubsub' | 'sns' | 'logs'>
): Promise<IFriendsComponent> {
  const { friendsDb, catalystClient, pubsub, sns, logs } = components
  const logger = logs.getLogger('friends-component')

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
    },
    getFriendshipStatus: async (loggedUserAddress: string, userAddress: string): Promise<FriendshipStatus> => {
      const lastFriendshipAction = await friendsDb.getLastFriendshipActionByUsers(loggedUserAddress, userAddress)
      return getFriendshipRequestStatus(lastFriendshipAction, loggedUserAddress)
    },
    getMutualFriendsProfiles: async (
      requesterAddress: string,
      requestedAddress: string,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const [mutualFriends, total] = await Promise.all([
        friendsDb.getMutualFriends(requesterAddress, requestedAddress, pagination),
        friendsDb.getMutualFriendsCount(requesterAddress, requestedAddress)
      ])

      const profiles = await catalystClient.getProfiles(mutualFriends.map((friend) => friend.address))

      return {
        friendsProfiles: profiles,
        total
      }
    },
    getPendingFriendshipRequests: async (
      userAddress: string,
      pagination?: Pagination
    ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }> => {
      const [pendingRequests, pendingRequestsCount] = await Promise.all([
        friendsDb.getReceivedFriendshipRequests(userAddress, pagination),
        friendsDb.getReceivedFriendshipRequestsCount(userAddress)
      ])

      const pendingRequestsAddresses = pendingRequests.map(({ address }) => address)
      const pendingRequesterProfiles = await catalystClient.getProfiles(pendingRequestsAddresses)

      return {
        requests: pendingRequests,
        profiles: pendingRequesterProfiles,
        total: pendingRequestsCount
      }
    },
    getSentFriendshipRequests: async (
      userAddress: string,
      pagination?: Pagination
    ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }> => {
      const [sentRequests, sentRequestsCount] = await Promise.all([
        friendsDb.getSentFriendshipRequests(userAddress, pagination),
        friendsDb.getSentFriendshipRequestsCount(userAddress)
      ])

      const sentRequestsAddresses = sentRequests.map(({ address }) => address)
      const sentRequestedProfiles = await catalystClient.getProfiles(sentRequestsAddresses)

      return {
        requests: sentRequests,
        profiles: sentRequestedProfiles,
        total: sentRequestsCount
      }
    },
    unblockUser: async (blockerAddress: string, blockedAddress: string): Promise<Profile> => {
      const profile = await catalystClient.getProfile(blockedAddress)

      if (!profile) {
        throw new ProfileNotFoundError(blockedAddress)
      }

      const actionId = await friendsDb.executeTx(async (tx) => {
        await friendsDb.unblockUser(blockerAddress, blockedAddress, tx)

        const friendship = await friendsDb.getFriendship([blockerAddress, blockedAddress], tx)
        if (!friendship) return

        const actionId = await friendsDb.recordFriendshipAction(friendship.id, blockerAddress, Action.DELETE, null, tx)
        return actionId
      })

      await Promise.all([
        actionId
          ? pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
              id: actionId,
              from: blockerAddress,
              to: blockedAddress,
              action: Action.DELETE,
              timestamp: Date.now()
            })
          : Promise.resolve(),
        pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
          blockerAddress,
          blockedAddress,
          isBlocked: false
        })
      ])

      return profile
    },
    upsertFriendship: async (
      userAddress: EthAddress,
      friendAddress: EthAddress,
      action: Action,
      metadata: Record<string, string> | null
    ) => {
      const isBlocked = await friendsDb.isFriendshipBlocked(userAddress, friendAddress)

      if (isBlocked) {
        throw new BlockedUserError()
      }

      const lastAction = await friendsDb.getLastFriendshipActionByUsers(userAddress, friendAddress)

      const friendshipStatus = getNewFriendshipStatus(action)
      const isActive = friendshipStatus === FriendshipStatus.ACCEPTED

      const { id, actionId, createdAt } = await friendsDb.executeTx(async (tx) => {
        let id: string, createdAt: Date

        if (lastAction) {
          const { created_at } = await friendsDb.updateFriendshipStatus(lastAction.friendship_id, isActive, tx)
          id = lastAction.friendship_id
          createdAt = created_at
        } else {
          const { id: newFriendshipId, created_at } = await friendsDb.createFriendship(
            [userAddress, friendAddress],
            isActive,
            tx
          )
          id = newFriendshipId
          createdAt = created_at
        }

        const actionId = await friendsDb.recordFriendshipAction(id, userAddress, action, metadata, tx)

        return { id, actionId, createdAt }
      })

      const [_, profiles] = await Promise.all([
        await pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
          id: actionId,
          from: userAddress,
          to: friendAddress,
          action,
          timestamp: Date.now(),
          metadata
        }),
        catalystClient.getProfiles([userAddress, friendAddress])
      ])

      const profilesMap = new Map(profiles.map((profile) => [getProfileUserId(profile), profile]))

      const senderProfile = profilesMap.get(userAddress)
      const receiverProfile = profilesMap.get(friendAddress)

      if (!senderProfile || !receiverProfile) {
        logger.error('profiles not found', {
          senderProfile: senderProfile ? getProfileUserId(senderProfile) : '',
          receiverProfile: receiverProfile ? getProfileUserId(receiverProfile) : ''
        })

        throw new ProfileNotFoundError(senderProfile ? friendAddress : userAddress)
      }

      const friendshipRequest = {
        id,
        address: friendAddress,
        timestamp: createdAt.toString(),
        metadata: metadata || null
      }

      setImmediate(async () => {
        if (shouldNotify(action)) {
          await sendNotification(
            action,
            {
              requestId: actionId,
              senderAddress: userAddress,
              receiverAddress: friendAddress,
              senderProfile,
              receiverProfile,
              message: metadata?.message
            },
            { sns, logs }
          )
        }
      })

      return {
        friendshipRequest,
        receiverProfile
      }
    }
  }
}

import { EthAddress } from '@dcl/schemas'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import {
  Action,
  AppComponents,
  BlockedUserWithDate,
  FriendshipAction,
  FriendshipRequest,
  FriendshipStatus
} from '../../types'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { isErrorWithMessage } from '../../utils/errors'
import { getProfileUserId } from '../profiles'
import { sendNotification, shouldNotify } from '../notifications'
import {
  BlockedUserError,
  FriendshipRateLimitError,
  InvalidFriendshipActionError,
  ProfileNotFoundError
} from './errors'
import { getNewFriendshipStatus, validateNewFriendshipAction } from './friendships'
import {
  normalizeBlockedUsersPagination,
  normalizeFriendsPagination,
  normalizeFriendshipRequestsPagination
} from '../../utils/friendship-pagination'
import { BlockedUser, IFriendsComponent } from './types'

// Pair rate-limit buckets. The two scopes MUST keep separate keys: a friendship is symmetric, a block is not.
const PAIR_RATE_LIMIT_KEY = {
  // Friendship: one bucket per unordered pair, both directions share it.
  symmetric: (actor: string, target: string): string => `friends:rate:pair:sym:${[actor, target].sort().join(':')}`,
  // Block/unblock: one bucket per ordered pair, so one account cannot spend the budget the other
  // needs to block back.
  directional: (actor: string, target: string): string => `friends:rate:pair:dir:${actor}:${target}`
} as const

type PairRateLimitScope = keyof typeof PAIR_RATE_LIMIT_KEY

export async function createFriendsComponent(
  components: Pick<AppComponents, 'friendsDb' | 'registry' | 'pubsub' | 'sns' | 'logs' | 'redis' | 'config' | 'metrics'>
): Promise<IFriendsComponent> {
  const { friendsDb, registry, pubsub, sns, logs, redis, config, metrics } = components
  const logger = logs.getLogger('friends-component')
  const rateLimitWindowSeconds = (await config.getNumber('FRIENDSHIP_RATE_LIMIT_WINDOW_SECONDS')) ?? 60
  const actorRateLimit = (await config.getNumber('FRIENDSHIP_RATE_LIMIT_PER_ACTOR')) ?? 30
  const pairRateLimit = (await config.getNumber('FRIENDSHIP_RATE_LIMIT_PER_PAIR')) ?? 10

  /**
   * Consumes one rate-limit token, failing open if Redis is unreachable.
   *
   * The limiter is an abuse control, not an authorization control: a Redis outage must not
   * take friendship and block mutations down with it. Exhaustion still rejects.
   */
  async function consumeOrFailOpen(key: string, limit: number): Promise<boolean> {
    try {
      return await redis.consumeRateLimit(key, limit, rateLimitWindowSeconds)
    } catch (error) {
      logger.error('Friendship rate limiter unavailable, allowing the action', {
        key,
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      metrics.increment('friendship_rate_limiter_unavailable')
      return true
    }
  }

  async function enforceMutationRateLimit(
    actorAddress: string,
    targetAddress: string,
    scope: PairRateLimitScope
  ): Promise<void> {
    const actor = actorAddress.toLowerCase()
    const target = targetAddress.toLowerCase()

    const actorAllowed = await consumeOrFailOpen(`friends:rate:actor:${actor}`, actorRateLimit)
    if (!actorAllowed) throw new FriendshipRateLimitError()

    const pairAllowed = await consumeOrFailOpen(PAIR_RATE_LIMIT_KEY[scope](actor, target), pairRateLimit)
    if (!pairAllowed) throw new FriendshipRateLimitError()
  }

  return {
    getFriendsProfiles: async (
      userAddress: EthAddress,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const [friends, total] = await Promise.all([
        friendsDb.getFriends(userAddress, { pagination: normalizeFriendsPagination(pagination), onlyActive: true }),
        friendsDb.getFriendsCount(userAddress, { onlyActive: true })
      ])

      const friendsProfiles = await registry.getProfiles(friends.map((friend) => friend.address))

      return {
        friendsProfiles,
        total
      }
    },
    blockUser: async (blockerAddress: string, blockedAddress: string): Promise<BlockedUser> => {
      await enforceMutationRateLimit(blockerAddress, blockedAddress, 'directional')
      const profile = await registry.getProfile(blockedAddress)

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
      userAddress: string,
      pagination: Pagination
    ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }> => {
      // total must be the row count, not the page length: clients page until they reach it.
      const [blockedUsers, total] = await Promise.all([
        friendsDb.getBlockedUsers(userAddress, normalizeBlockedUsersPagination(pagination)),
        friendsDb.getBlockedUsersCount(userAddress)
      ])
      const profiles = await registry.getProfiles(blockedUsers.map((user) => user.address))

      return {
        blockedUsers,
        blockedProfiles: profiles,
        total
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
    getFriendshipStatus: async (
      loggedUserAddress: string,
      userAddress: string
    ): Promise<FriendshipAction | undefined> => {
      const lastFriendshipAction = await friendsDb.getLastFriendshipActionByUsers(loggedUserAddress, userAddress)
      return lastFriendshipAction
    },
    getMutualFriendsProfiles: async (
      requesterAddress: string,
      requestedAddress: string,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const [mutualFriends, total] = await Promise.all([
        friendsDb.getMutualFriends(requesterAddress, requestedAddress, normalizeFriendsPagination(pagination)),
        friendsDb.getMutualFriendsCount(requesterAddress, requestedAddress)
      ])

      const profiles = await registry.getProfiles(mutualFriends.map((friend) => friend.address))

      return {
        friendsProfiles: profiles,
        total
      }
    },
    getPendingFriendshipRequests: async (
      userAddress: string,
      pagination?: Pagination
    ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }> => {
      const boundedPagination = normalizeFriendshipRequestsPagination(pagination)
      const [pendingRequests, pendingRequestsCount] = await Promise.all([
        friendsDb.getReceivedFriendshipRequests(userAddress, boundedPagination),
        friendsDb.getReceivedFriendshipRequestsCount(userAddress)
      ])

      const pendingRequestsAddresses = pendingRequests.map(({ address }) => address)
      const pendingRequesterProfiles = await registry.getProfiles(pendingRequestsAddresses)

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
      const boundedPagination = normalizeFriendshipRequestsPagination(pagination)
      const [sentRequests, sentRequestsCount] = await Promise.all([
        friendsDb.getSentFriendshipRequests(userAddress, boundedPagination),
        friendsDb.getSentFriendshipRequestsCount(userAddress)
      ])

      const sentRequestsAddresses = sentRequests.map(({ address }) => address)
      const sentRequestedProfiles = await registry.getProfiles(sentRequestsAddresses)

      return {
        requests: sentRequests,
        profiles: sentRequestedProfiles,
        total: sentRequestsCount
      }
    },
    unblockUser: async (blockerAddress: string, blockedAddress: string): Promise<Profile> => {
      await enforceMutationRateLimit(blockerAddress, blockedAddress, 'directional')
      const profile = await registry.getProfile(blockedAddress)

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
      await enforceMutationRateLimit(userAddress, friendAddress, 'symmetric')
      const isBlocked = await friendsDb.isFriendshipBlocked(userAddress, friendAddress)

      if (isBlocked) {
        throw new BlockedUserError()
      }

      const lastAction = await friendsDb.getLastFriendshipActionByUsers(userAddress, friendAddress)

      // Enforce the friendship state machine before mutating any state. Without this guard an action
      // like ACCEPT with no pending request would be applied blindly, letting a user forge another
      // user's friendship (setting is_active = true) with no consent and defeat privacy gates that
      // key on that flag (e.g. the ONLY_FRIENDS private-voice check).
      if (!validateNewFriendshipAction(userAddress, { action, user: friendAddress }, lastAction)) {
        throw new InvalidFriendshipActionError()
      }

      const friendshipStatus = getNewFriendshipStatus(action)
      const isActive = friendshipStatus === FriendshipStatus.Friends

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
        registry.getProfiles([userAddress, friendAddress])
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

      if (shouldNotify(action)) {
        void sendNotification(
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

      return {
        friendshipRequest,
        receiverProfile
      }
    }
  }
}

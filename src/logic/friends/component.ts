import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError } from '@dcl/http-commons'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import {
  Action,
  AppComponents,
  BlockedUserWithDate,
  FriendshipAction,
  FriendshipRequest,
  FriendshipStatus,
  User
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
import { normalizeAddress } from '../../utils/address'
import { BlockedUser, IFriendsComponent } from './types'
import { FRIENDSHIP_REQUEST_MESSAGE_MAX_LENGTH } from './constants'

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

  /**
   * Best-effort profile lookup for response enrichment.
   *
   * A wallet with no deployed profile — or one the registry cannot reduce to a minimal profile —
   * must still be blockable, so this never decides whether the block happens.
   */
  async function tryGetProfile(address: string): Promise<Profile | null> {
    try {
      return await registry.getProfile(address)
    } catch (error) {
      logger.warn('Could not resolve a profile for a blocked address; continuing without it', {
        address,
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Validates, writes and publishes a friendship action. Every variant of `upsertFriendship` goes through
   * here, so the message bound, the rate limits, the block check and the state machine are the same
   * whether the caller wants profiles back or not.
   */
  async function applyFriendshipAction(
    userAddress: EthAddress,
    friendAddress: EthAddress,
    action: Action,
    metadata: Record<string, string> | null
  ): Promise<{ id: string; actionId: string; createdAt: Date }> {
    if (metadata?.message && [...metadata.message].length > FRIENDSHIP_REQUEST_MESSAGE_MAX_LENGTH) {
      throw new InvalidRequestError(
        `The friendship request message cannot be longer than ${FRIENDSHIP_REQUEST_MESSAGE_MAX_LENGTH} characters`
      )
    }

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

    await pubsub.publishInChannel(FRIENDSHIP_UPDATES_CHANNEL, {
      id: actionId,
      from: userAddress,
      to: friendAddress,
      action,
      timestamp: Date.now(),
      metadata
    })

    return { id, actionId, createdAt }
  }

  /**
   * Sends the notification of an action that is already committed. The notification carries both
   * users' names and pictures, so a profile that can't be resolved skips it instead of failing the action.
   */
  async function notifyFriendshipAction(
    action: Action.REQUEST | Action.ACCEPT,
    actionId: string,
    userAddress: EthAddress,
    friendAddress: EthAddress,
    metadata: Record<string, string> | null
  ): Promise<void> {
    try {
      const profiles = await registry.getProfiles([userAddress, friendAddress])
      const profilesMap = new Map(profiles.map((profile) => [getProfileUserId(profile), profile]))
      const senderProfile = profilesMap.get(userAddress)
      const receiverProfile = profilesMap.get(friendAddress)

      if (!senderProfile || !receiverProfile) {
        logger.warn('Skipping the friendship notification, a profile could not be resolved', {
          action,
          senderAddress: userAddress,
          receiverAddress: friendAddress
        })
        return
      }

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
    } catch (error) {
      logger.error('Could not send the friendship notification', {
        action,
        senderAddress: userAddress,
        receiverAddress: friendAddress,
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  async function getFriends(
    userAddress: EthAddress,
    pagination?: Pagination
  ): Promise<{ friends: User[]; total: number }> {
    const [friends, total] = await Promise.all([
      friendsDb.getFriends(userAddress, { pagination: normalizeFriendsPagination(pagination), onlyActive: true }),
      friendsDb.getFriendsCount(userAddress, { onlyActive: true })
    ])

    // The rows carry more columns than the address; only the address is part of the contract.
    return { friends: friends.map(({ address }) => ({ address })), total }
  }

  async function getMutualFriends(
    requesterAddress: string,
    requestedAddress: string,
    pagination?: Pagination
  ): Promise<{ friends: User[]; total: number }> {
    const [friends, total] = await Promise.all([
      friendsDb.getMutualFriends(requesterAddress, requestedAddress, normalizeFriendsPagination(pagination)),
      friendsDb.getMutualFriendsCount(requesterAddress, requestedAddress)
    ])

    return { friends: friends.map(({ address }) => ({ address })), total }
  }

  async function getPendingFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; total: number }> {
    const boundedPagination = normalizeFriendshipRequestsPagination(pagination)
    const [requests, total] = await Promise.all([
      friendsDb.getReceivedFriendshipRequests(userAddress, boundedPagination),
      friendsDb.getReceivedFriendshipRequestsCount(userAddress)
    ])

    return { requests, total }
  }

  async function getSentFriendshipRequests(
    userAddress: string,
    pagination?: Pagination
  ): Promise<{ requests: FriendshipRequest[]; total: number }> {
    const boundedPagination = normalizeFriendshipRequestsPagination(pagination)
    const [requests, total] = await Promise.all([
      friendsDb.getSentFriendshipRequests(userAddress, boundedPagination),
      friendsDb.getSentFriendshipRequestsCount(userAddress)
    ])

    return { requests, total }
  }

  /** Writes the block and publishes it. Shared by both variants of `blockUser`. */
  async function applyBlock(
    blockerAddress: string,
    rawBlockedAddress: string
  ): Promise<{ blockedAddress: string; blockedAt: Date }> {
    // Normalize once, up front. EthAddress.validate accepts EIP-55 mixed case and the database
    // layer lowercases on write, so an un-normalized value here would still block correctly but
    // publish an address the subscription filters — which compare against the always-lowercased
    // connection address — would never match, leaving the blocked user's client unaware.
    const blockedAddress = normalizeAddress(rawBlockedAddress)

    await enforceMutationRateLimit(blockerAddress, blockedAddress, 'directional')

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

    return { blockedAddress, blockedAt }
  }

  /** Removes the block and publishes it. Shared by both variants of `unblockUser`. */
  async function applyUnblock(blockerAddress: string, rawBlockedAddress: string): Promise<string> {
    const blockedAddress = normalizeAddress(rawBlockedAddress)

    await enforceMutationRateLimit(blockerAddress, blockedAddress, 'directional')

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

    return blockedAddress
  }

  async function getBlockedUsers(
    userAddress: string,
    pagination: Pagination
  ): Promise<{ blockedUsers: BlockedUserWithDate[]; total: number }> {
    // total must be the row count, not the page length: clients page until they reach it.
    const [blockedUsers, total] = await Promise.all([
      friendsDb.getBlockedUsers(userAddress, normalizeBlockedUsersPagination(pagination)),
      friendsDb.getBlockedUsersCount(userAddress)
    ])

    return { blockedUsers, total }
  }

  return {
    getFriendsProfiles: async (
      userAddress: EthAddress,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const { friends, total } = await getFriends(userAddress, pagination)
      const friendsProfiles = await registry.getProfiles(friends.map((friend) => friend.address))

      return {
        friendsProfiles,
        total
      }
    },
    getFriendsWithoutProfiles: getFriends,
    blockUser: async (blockerAddress: string, rawBlockedAddress: string): Promise<BlockedUser> => {
      const { blockedAddress, blockedAt } = await applyBlock(blockerAddress, rawBlockedAddress)

      return { profile: await tryGetProfile(blockedAddress), blockedAt }
    },
    blockUserWithoutProfile: async (blockerAddress: string, blockedAddress: string): Promise<{ blockedAt: Date }> => {
      const { blockedAt } = await applyBlock(blockerAddress, blockedAddress)

      return { blockedAt }
    },
    getBlockedUsers: async (
      userAddress: string,
      pagination: Pagination
    ): Promise<{ blockedUsers: BlockedUserWithDate[]; blockedProfiles: Profile[]; total: number }> => {
      const { blockedUsers, total } = await getBlockedUsers(userAddress, pagination)
      const profiles = await registry.getProfiles(blockedUsers.map((user) => user.address))

      return {
        blockedUsers,
        blockedProfiles: profiles,
        total
      }
    },
    getBlockedUsersWithoutProfiles: getBlockedUsers,
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
      const { friends, total } = await getMutualFriends(requesterAddress, requestedAddress, pagination)
      const profiles = await registry.getProfiles(friends.map((friend) => friend.address))

      return {
        friendsProfiles: profiles,
        total
      }
    },
    getMutualFriendsWithoutProfiles: getMutualFriends,
    getPendingFriendshipRequests: async (
      userAddress: string,
      pagination?: Pagination
    ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }> => {
      const { requests, total } = await getPendingFriendshipRequests(userAddress, pagination)
      const profiles = await registry.getProfiles(requests.map(({ address }) => address))

      return {
        requests,
        profiles,
        total
      }
    },
    getPendingFriendshipRequestsWithoutProfiles: getPendingFriendshipRequests,
    getSentFriendshipRequests: async (
      userAddress: string,
      pagination?: Pagination
    ): Promise<{ requests: FriendshipRequest[]; profiles: Profile[]; total: number }> => {
      const { requests, total } = await getSentFriendshipRequests(userAddress, pagination)
      const profiles = await registry.getProfiles(requests.map(({ address }) => address))

      return {
        requests,
        profiles,
        total
      }
    },
    getSentFriendshipRequestsWithoutProfiles: getSentFriendshipRequests,
    unblockUser: async (blockerAddress: string, rawBlockedAddress: string): Promise<Profile | null> => {
      const blockedAddress = await applyUnblock(blockerAddress, rawBlockedAddress)

      return tryGetProfile(blockedAddress)
    },
    unblockUserWithoutProfile: async (blockerAddress: string, blockedAddress: string): Promise<void> => {
      await applyUnblock(blockerAddress, blockedAddress)
    },
    upsertFriendship: async (
      userAddress: EthAddress,
      friendAddress: EthAddress,
      action: Action,
      metadata: Record<string, string> | null
    ) => {
      const { id, actionId, createdAt } = await applyFriendshipAction(userAddress, friendAddress, action, metadata)

      const profiles = await registry.getProfiles([userAddress, friendAddress])
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
    },
    upsertFriendshipWithoutProfiles: async (
      userAddress: EthAddress,
      friendAddress: EthAddress,
      action: Action,
      metadata: Record<string, string> | null
    ): Promise<FriendshipRequest> => {
      const { id, actionId, createdAt } = await applyFriendshipAction(userAddress, friendAddress, action, metadata)

      if (shouldNotify(action)) {
        void notifyFriendshipAction(action, actionId, userAddress, friendAddress, metadata)
      }

      return {
        id,
        address: friendAddress,
        timestamp: createdAt.toString(),
        metadata: metadata || null
      }
    }
  }
}

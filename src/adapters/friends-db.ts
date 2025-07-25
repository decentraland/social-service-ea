import SQL, { SQLStatement } from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { PoolClient } from 'pg'
import {
  AppComponents,
  Friendship,
  FriendshipAction,
  FriendshipRequest,
  IFriendsDatabaseComponent,
  User,
  Pagination,
  SocialSettings,
  BlockedUserWithDate
} from '../types'
import { FRIENDSHIPS_PER_PAGE } from './rpc-server/constants'
import { normalizeAddress } from '../utils/address'
import {
  getFriendsBaseQuery,
  getFriendsFromListBaseQuery,
  getFriendshipRequestsBaseQuery,
  getMutualFriendsBaseQuery
} from '../logic/queries'

type FriendshipRequestType = 'sent' | 'received'

export function createFriendsDBComponent(components: Pick<AppComponents, 'pg' | 'logs'>): IFriendsDatabaseComponent {
  const { pg } = components

  function getFriendshipRequests(type: FriendshipRequestType) {
    return async (userAddress: string, pagination?: Pagination) => {
      const query = getFriendshipRequestsBaseQuery(userAddress, type, { pagination })
      const result = await pg.query<FriendshipRequest>(query)
      return result.rows
    }
  }

  function getFriendshipRequestsCount(type: FriendshipRequestType) {
    return async (userAddress: string) => {
      const query = getFriendshipRequestsBaseQuery(userAddress, type, { onlyCount: true })
      return pg.getCount(query)
    }
  }

  return {
    async getFriends(userAddress, { onlyActive, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 } } = {}) {
      const query: SQLStatement = getFriendsBaseQuery(userAddress, { onlyActive, pagination })
      const result = await pg.query<User>(query)
      return result.rows
    },
    async getFriendsFromList(userAddress: string, otherUserAddresses: string[]): Promise<User[]> {
      const query = getFriendsFromListBaseQuery(userAddress, otherUserAddresses)
      const result = await pg.query<User>(query)
      return result.rows
    },
    async getFriendsCount(userAddress, { onlyActive } = { onlyActive: true }) {
      const query: SQLStatement = getFriendsBaseQuery(userAddress, { onlyActive, onlyCount: true })
      return pg.getCount(query)
    },
    async getMutualFriends(userAddress1, userAddress2, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 }) {
      const query = getMutualFriendsBaseQuery(userAddress1, userAddress2, { pagination })
      const result = await pg.query<User>(query)
      return result.rows
    },
    async getMutualFriendsCount(userAddress1, userAddress2) {
      const query = getMutualFriendsBaseQuery(userAddress1, userAddress2, { onlyCount: true })
      return pg.getCount(query)
    },
    async getFriendship(users, txClient) {
      const [userAddress1, userAddress2] = users.map(normalizeAddress)
      const query = SQL`SELECT * FROM friendships WHERE (address_requester, address_requested) IN ((${userAddress1}, ${userAddress2}), (${userAddress2}, ${userAddress1}))`

      const results = txClient ? await txClient.query<Friendship>(query) : await pg.query<Friendship>(query)
      return results.rows[0]
    },
    async getLastFriendshipActionByUsers(loggedUser: string, friendUser: string) {
      const normalizedLoggedUser = normalizeAddress(loggedUser)
      const normalizedFriendUser = normalizeAddress(friendUser)

      const query = SQL`
        SELECT fa.*
        FROM friendships f
        INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
        WHERE (f.address_requester, f.address_requested) IN ((${normalizedLoggedUser}, ${normalizedFriendUser}), (${normalizedFriendUser}, ${normalizedLoggedUser}))
        ORDER BY fa.timestamp DESC LIMIT 1
      `

      const results = await pg.query<FriendshipAction>(query)

      return results.rows[0]
    },
    async createFriendship(users, isActive, txClient) {
      const [addressRequester, addressRequested] = users
      const uuid = randomUUID()

      const query = SQL`
      INSERT INTO friendships (id, address_requester, address_requested, is_active)
      VALUES (${uuid}, ${normalizeAddress(addressRequester)}, ${normalizeAddress(addressRequested)}, ${isActive})
      RETURNING id, created_at`

      const {
        rows: [{ id, created_at }]
      } = txClient
        ? await txClient.query<{ id: string; created_at: Date }>(query)
        : await pg.query<{ id: string; created_at: Date }>(query)

      return {
        id,
        created_at
      }
    },
    async updateFriendshipStatus(friendshipId, isActive, txClient) {
      const query = SQL`UPDATE friendships SET is_active = ${isActive}, updated_at = now() WHERE id = ${friendshipId} RETURNING id, created_at`

      const {
        rows: [{ id, created_at }]
      } = txClient
        ? await txClient.query<{ id: string; created_at: Date }>(query)
        : await pg.query<{ id: string; created_at: Date }>(query)

      return {
        id,
        created_at
      }
    },
    async recordFriendshipAction(friendshipId, actingUser, action, metadata, txClient) {
      const uuid = randomUUID()
      const query = SQL`
        INSERT INTO friendship_actions (id, friendship_id, action, acting_user, metadata) 
        VALUES (${uuid}, ${friendshipId}, ${action}, ${normalizeAddress(actingUser)}, ${metadata})`

      if (txClient) {
        await txClient.query(query)
      } else {
        await pg.query(query)
      }

      return uuid
    },
    getReceivedFriendshipRequests: getFriendshipRequests('received'),
    getReceivedFriendshipRequestsCount: getFriendshipRequestsCount('received'),
    getSentFriendshipRequests: getFriendshipRequests('sent'),
    getSentFriendshipRequestsCount: getFriendshipRequestsCount('sent'),
    async getOnlineFriends(userAddress: string, onlinePotentialFriends: string[]) {
      if (onlinePotentialFriends.length === 0) return []

      const normalizedUserAddress = normalizeAddress(userAddress)
      const normalizedOnlinePotentialFriends = onlinePotentialFriends.map(normalizeAddress)

      const query: SQLStatement = SQL`
        SELECT DISTINCT
          CASE
            WHEN address_requester = ${normalizedUserAddress} THEN address_requested
            ELSE address_requester
          END as address
        FROM friendships
        WHERE (
          (address_requester = ${normalizedUserAddress} AND address_requested = ANY(${normalizedOnlinePotentialFriends}))
          OR
          (address_requested = ${normalizedUserAddress} AND address_requester = ANY(${normalizedOnlinePotentialFriends}))
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocker_address = ${normalizedUserAddress} AND blocked_address = ANY(${normalizedOnlinePotentialFriends}))
          OR (blocker_address = ANY(${normalizedOnlinePotentialFriends}) AND blocked_address = ${normalizedUserAddress})
        )
        AND is_active = true`

      const results = await pg.query<User>(query)
      return results.rows
    },
    async getSocialSettings(userAddresses: string[]): Promise<SocialSettings[]> {
      const query = SQL`
        SELECT * FROM social_settings WHERE address = ANY(${userAddresses})
      `
      const results = await pg.query<{ private_messages_privacy: string }>(query)
      return results.rows as SocialSettings[]
    },
    async deleteSocialSettings(userAddress: string): Promise<void> {
      const query = SQL`DELETE FROM social_settings WHERE address = ${userAddress}`
      await pg.query(query)
    },
    async upsertSocialSettings(
      userAddress: string,
      settings: Partial<Omit<SocialSettings, 'address'>>
    ): Promise<SocialSettings> {
      const keys = Object.keys(settings)
      const values = [normalizeAddress(userAddress), ...Object.values(settings)].reduce(
        (acc, value, index, array) => {
          return acc.append(SQL`${value}`).append(index === array.length - 1 ? '' : ', ')
        },
        SQL``
      )
      const update = Object.entries(settings).reduce(
        (acc, [key, value], index, array) =>
          acc
            .append(`${key} = `)
            .append(SQL`${value}`)
            .append(index === array.length - 1 ? '' : ', '),
        SQL``
      )
      const query = SQL`INSERT INTO social_settings (address, `
        .append(`${keys.join(', ')}) VALUES (`)
        .append(values)
        .append(`) ON CONFLICT (address) DO UPDATE SET `)
        .append(update)
        .append(SQL` WHERE social_settings.address = ${userAddress} RETURNING *`)
      const results = await pg.query<SocialSettings>(query)
      return results.rows[0]
    },
    async blockUser(blockerAddress, blockedAddress, txClient) {
      const query = SQL`
        INSERT INTO blocks (id, blocker_address, blocked_address)
        VALUES (${randomUUID()}, ${normalizeAddress(blockerAddress)}, ${normalizeAddress(blockedAddress)})
        ON CONFLICT (blocker_address, blocked_address) DO UPDATE SET id = blocks.id, blocked_at = blocks.blocked_at
        RETURNING id, blocked_at`

      const {
        rows: [{ id, blocked_at }]
      } = txClient
        ? await txClient.query<{ id: string; blocked_at: Date }>(query)
        : await pg.query<{ id: string; blocked_at: Date }>(query)

      return {
        id,
        blocked_at
      }
    },
    async unblockUser(blockerAddress, blockedAddress, txClient) {
      const query = SQL`
        DELETE FROM blocks
        WHERE blocker_address = ${normalizeAddress(blockerAddress)}
          AND blocked_address = ${normalizeAddress(blockedAddress)}
      `
      if (txClient) {
        await txClient.query(query)
      } else {
        await pg.query(query)
      }
    },
    async blockUsers(blockerAddress, blockedAddresses) {
      const query = SQL`INSERT INTO blocks (id, blocker_address, blocked_address) VALUES `

      blockedAddresses.forEach((blockedAddress, index) => {
        query.append(SQL`(${randomUUID()}, ${normalizeAddress(blockerAddress)}, ${normalizeAddress(blockedAddress)})`)
        if (index < blockedAddresses.length - 1) {
          query.append(SQL`, `)
        }
      })

      query.append(SQL` ON CONFLICT DO NOTHING`)
      await pg.query(query)
    },
    async unblockUsers(blockerAddress, blockedAddresses) {
      const query = SQL`
        DELETE FROM blocks
        WHERE blocker_address = ${normalizeAddress(blockerAddress)}
          AND blocked_address = ANY(${blockedAddresses.map(normalizeAddress)})
      `
      await pg.query(query)
    },
    async getBlockedUsers(blockerAddress) {
      const query = SQL`
        SELECT blocked_address as address, blocked_at FROM blocks WHERE blocker_address = ${normalizeAddress(blockerAddress)}
      `
      const result = await pg.query<BlockedUserWithDate>(query)
      return result.rows
    },
    async getBlockedByUsers(blockedAddress) {
      const query = SQL`
        SELECT blocker_address as address, blocked_at FROM blocks WHERE blocked_address = ${normalizeAddress(blockedAddress)}
      `
      const result = await pg.query<BlockedUserWithDate>(query)
      return result.rows
    },
    async isFriendshipBlocked(loggedUserAddress, anotherUserAddress) {
      const normalizedLoggedUserAddress = normalizeAddress(loggedUserAddress)
      const normalizedAnotherUserAddress = normalizeAddress(anotherUserAddress)

      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocker_address, blocked_address) IN ((${normalizedLoggedUserAddress}, ${normalizedAnotherUserAddress}), (${normalizedAnotherUserAddress}, ${normalizedLoggedUserAddress}))
        )
      `
      const results = await pg.query<{ exists: boolean }>(query)
      return results.rows[0].exists
    },
    async executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T> {
      return pg.withTransaction(cb)
    }
  }
}

import SQL, { SQLStatement } from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { PoolClient } from 'pg'
import {
  AppComponents,
  Friendship,
  FriendshipAction,
  FriendshipRequest,
  IDatabaseComponent,
  Friend,
  BlockedUser,
  Pagination
} from '../types'
import { FRIENDSHIPS_PER_PAGE } from './rpc-server/constants'
import { normalizeAddress } from '../utils/address'
import { getFriendsBaseQuery, getFriendshipRequestsBaseQuery, getMutualFriendsBaseQuery } from '../logic/queries'

type FriendshipRequestType = 'sent' | 'received'

export function createDBComponent(components: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('db-component')

  async function getCount(query: SQLStatement) {
    const result = await pg.query<{ count: number }>(query)
    return result.rows[0].count
  }

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
      return getCount(query)
    }
  }

  return {
    async getFriends(userAddress, { onlyActive, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 } } = {}) {
      const query: SQLStatement = getFriendsBaseQuery(userAddress, { onlyActive, pagination })
      const result = await pg.query<Friend>(query)
      return result.rows
    },
    async getFriendsCount(userAddress, { onlyActive } = { onlyActive: true }) {
      const query: SQLStatement = getFriendsBaseQuery(userAddress, { onlyActive, onlyCount: true })
      return getCount(query)
    },
    async getMutualFriends(userAddress1, userAddress2, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 }) {
      const result = await pg.query<Friend>(getMutualFriendsBaseQuery(userAddress1, userAddress2, { pagination }))
      return result.rows
    },
    async getMutualFriendsCount(userAddress1, userAddress2) {
      return getCount(getMutualFriendsBaseQuery(userAddress1, userAddress2, { onlyCount: true }))
    },
    async getFriendship(users) {
      const [userAddress1, userAddress2] = users.map(normalizeAddress)
      const query = SQL`
        SELECT * FROM friendships 
          WHERE (LOWER(address_requester), LOWER(address_requested)) IN ((${userAddress1}, ${userAddress2}), (${userAddress2}, ${userAddress1}))
      `

      const results = await pg.query<Friendship>(query)

      return results.rows[0]
    },
    async getLastFriendshipAction(friendshipId) {
      const query = SQL`
        SELECT * FROM friendship_actions where friendship_id = ${friendshipId} ORDER BY timestamp DESC LIMIT 1
      `
      const results = await pg.query<FriendshipAction>(query)

      return results.rows[0]
    },
    async getLastFriendshipActionByUsers(loggedUser: string, friendUser: string) {
      const normalizedLoggedUser = normalizeAddress(loggedUser)
      const normalizedFriendUser = normalizeAddress(friendUser)

      const query = SQL`
        SELECT fa.*
        FROM friendships f
        INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
        WHERE (LOWER(f.address_requester), LOWER(f.address_requested)) IN ((${normalizedLoggedUser}, ${normalizedFriendUser}), (${normalizedFriendUser}, ${normalizedLoggedUser}))
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
            WHEN LOWER(address_requester) = ${normalizedUserAddress} THEN LOWER(address_requested)
            ELSE LOWER(address_requester)
          END as address
        FROM friendships
        WHERE (
          (LOWER(address_requester) = ${normalizedUserAddress} AND LOWER(address_requested) = ANY(${normalizedOnlinePotentialFriends}))
          OR
          (LOWER(address_requested) = ${normalizedUserAddress} AND LOWER(address_requester) = ANY(${normalizedOnlinePotentialFriends}))
        )
        AND is_active = true`

      const results = await pg.query<Friend>(query)
      return results.rows
    },
    async blockUser(blockerAddress, blockedAddress) {
      const query = SQL`
        INSERT INTO blocks (id, blocker_address, blocked_address)
        VALUES (${randomUUID()}, ${normalizeAddress(blockerAddress)}, ${normalizeAddress(blockedAddress)})
        ON CONFLICT DO NOTHING`
      await pg.query(query)
    },
    async unblockUser(blockerAddress, blockedAddress) {
      const query = SQL`
        DELETE FROM blocks
        WHERE LOWER(blocker_address) = ${normalizeAddress(blockerAddress)}
          AND LOWER(blocked_address) = ${normalizeAddress(blockedAddress)}
      `
      await pg.query(query)
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
        WHERE LOWER(blocker_address) = ${normalizeAddress(blockerAddress)}
          AND LOWER(blocked_address) = ANY(${blockedAddresses.map(normalizeAddress)})
      `
      await pg.query(query)
    },
    async getBlockedUsers(blockerAddress) {
      const query = SQL`
        SELECT blocked_address as address FROM blocks WHERE LOWER(blocker_address) = ${normalizeAddress(blockerAddress)}
      `
      const results = await pg.query<BlockedUser>(query)
      return results.rows.map((row) => row.address)
    },
    async executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T> {
      const pool = pg.getPool()
      const client = await pool.connect()
      await client.query('BEGIN')

      try {
        const res = await cb(client)
        await client.query('COMMIT')
        return res
      } catch (error: any) {
        logger.error(`Error executing transaction: ${error.message}`)
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }
}

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
  Pagination,
  Action
} from '../types'
import { FRIENDSHIPS_PER_PAGE } from './rpc-server/constants'
import { normalizeAddress } from '../utils/address'

export function createDBComponent(components: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('db-component')

  // TODO: abstract common statements in a util file
  function getFriendsBaseQuery(userAddress: string) {
    const normalizedUserAddress = normalizeAddress(userAddress)
    return SQL`
      SELECT DISTINCT
        CASE
          WHEN LOWER(address_requester) = ${normalizedUserAddress} THEN address_requested
          ELSE address_requester
        END as address,
        created_at
      FROM friendships
      WHERE (LOWER(address_requester) = ${normalizedUserAddress} OR LOWER(address_requested) = ${normalizedUserAddress})`
  }

  function getFriendshipRequestsBaseQuery(
    userAddress: string,
    type: 'sent' | 'received',
    { onlyCount, pagination }: { onlyCount?: boolean; pagination?: Pagination } = { onlyCount: false }
  ): SQLStatement {
    const { limit, offset } = pagination || {}
    const normalizedUserAddress = normalizeAddress(userAddress)

    const columnMapping = {
      sent: SQL`
        CASE
          WHEN LOWER(f.address_requester) = lr.acting_user THEN LOWER(f.address_requested)
          ELSE LOWER(f.address_requester)
        END`,
      received: SQL` LOWER(lr.acting_user)`
    }

    const filterMapping = {
      sent: SQL` LOWER(lr.acting_user) = ${normalizedUserAddress}`,
      received: SQL` LOWER(lr.acting_user) <> ${normalizedUserAddress} AND (LOWER(f.address_requester) = ${normalizedUserAddress} OR LOWER(f.address_requested) = ${normalizedUserAddress})`
    }

    const baseQuery = SQL`WITH latest_requests AS (
        SELECT DISTINCT ON (friendship_id) *
        FROM friendship_actions
        ORDER BY friendship_id, timestamp DESC
      ) SELECT`

    if (onlyCount) {
      baseQuery.append(SQL` DISTINCT COUNT(1) as count`)
    } else {
      baseQuery.append(SQL` lr.id,`)
      baseQuery.append(columnMapping[type])
      baseQuery.append(SQL` as address, lr.timestamp, lr.metadata`)
    }

    baseQuery.append(SQL` FROM friendships f`)
    baseQuery.append(SQL` INNER JOIN latest_requests lr ON f.id = lr.friendship_id`)
    baseQuery.append(SQL` WHERE`)
    baseQuery.append(filterMapping[type])
    baseQuery.append(SQL` AND action = ${Action.REQUEST}`)

    baseQuery.append(SQL` AND f.is_active IS FALSE`)

    if (!onlyCount) {
      baseQuery.append(SQL` ORDER BY lr.timestamp DESC`)

      if (limit) {
        baseQuery.append(SQL` LIMIT ${limit}`)
      }

      if (offset) {
        baseQuery.append(SQL` OFFSET ${offset}`)
      }
    }

    return baseQuery
  }

  return {
    async getFriends(userAddress, { onlyActive = true, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 } } = {}) {
      const { limit, offset } = pagination

      const query: SQLStatement = getFriendsBaseQuery(userAddress)

      if (onlyActive) {
        query.append(SQL` AND is_active = true`)
      }

      query.append(SQL` ORDER BY created_at DESC OFFSET ${offset} LIMIT ${limit}`)

      const result = await pg.query<Friend>(query)
      return result.rows
    },
    async getFriendsCount(userAddress, { onlyActive } = { onlyActive: true }) {
      const normalizedUserAddress = normalizeAddress(userAddress)
      const query: SQLStatement = SQL`
        SELECT COUNT(*)
        FROM friendships
        WHERE (LOWER(address_requester) = ${normalizedUserAddress} OR LOWER(address_requested) = ${normalizedUserAddress})`

      if (onlyActive) {
        query.append(SQL` AND is_active = true`)
      }

      const result = await pg.query<{ count: number }>(query)
      return result.rows[0].count
    },
    async getMutualFriends(userAddress1, userAddress2, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 }) {
      const { limit, offset } = pagination

      const normalizedUserAddress1 = normalizeAddress(userAddress1)
      const normalizedUserAddress2 = normalizeAddress(userAddress2)

      const result = await pg.query<Friend>(
        SQL`WITH friendsA as (
          SELECT
            CASE
              WHEN LOWER(address_requester) = ${normalizedUserAddress1} then address_requested
              else address_requester
            end as address
          FROM
            (
              SELECT f_a.*
              FROM friendships f_a
              WHERE
                (
                  LOWER(f_a.address_requester) = ${normalizedUserAddress1} or LOWER(f_a.address_requested) = ${normalizedUserAddress1}
                ) AND f_a.is_active = true
            ) as friends_a
        )
        SELECT
          f_b.address
        FROM
          friendsA f_b
        WHERE
          f_b.address IN (
            SELECT
              CASE
                WHEN LOWER(address_requester) = ${normalizedUserAddress2} then address_requested
                else address_requester
              end as address_a
            FROM
              (
                SELECT
                  f_b.*
                FROM
                  friendships f_b
                WHERE
                  (
                    LOWER(f_b.address_requester) = ${normalizedUserAddress2}
                    or LOWER(f_b.address_requested) = ${normalizedUserAddress2}
                  ) AND f_b.is_active = true
              ) as friends_b
          )
          ORDER BY f_b.address
          LIMIT ${limit}
          OFFSET ${offset}`
      )

      return result.rows
    },
    async getMutualFriendsCount(userAddress1, userAddress2) {
      const normalizedUserAddress1 = normalizeAddress(userAddress1)
      const normalizedUserAddress2 = normalizeAddress(userAddress2)

      const result = await pg.query<{ count: number }>(
        SQL`WITH friendsA as (
          SELECT
            CASE
              WHEN LOWER(address_requester) = ${normalizedUserAddress1} THEN address_requested
              ELSE address_requester
            END as address
          FROM
            (
              SELECT f_a.*
              FROM friendships f_a
              WHERE
                (
                  LOWER(f_a.address_requester) = ${normalizedUserAddress1}
                  OR LOWER(f_a.address_requested) = ${normalizedUserAddress1}
                ) AND f_a.is_active = true
            ) as friends_a
        )
        SELECT
          COUNT(address)
        FROM
          friendsA f_b
        WHERE
          address IN (
            SELECT
              CASE
                WHEN address_requester = ${normalizedUserAddress2} THEN address_requested
                ELSE address_requester
              END as address_a
            FROM
              (
                SELECT f_b.*
                FROM friendships f_b
                WHERE
                  (
                    f_b.address_requester = ${normalizedUserAddress2}
                    OR f_b.address_requested = ${normalizedUserAddress2}
                  ) AND f_b.is_active = true
              ) as friends_b
          )`
      )

      return result.rows[0].count
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
    async getReceivedFriendshipRequests(userAddress, pagination) {
      const query = getFriendshipRequestsBaseQuery(userAddress, 'received', { pagination })
      const results = await pg.query<FriendshipRequest>(query)
      return results.rows
    },
    async getReceivedFriendshipRequestsCount(userAddress) {
      const query = getFriendshipRequestsBaseQuery(userAddress, 'received', { onlyCount: true })
      const results = await pg.query<{ count: number }>(query)
      return results.rows[0].count
    },
    async getSentFriendshipRequests(userAddress, pagination) {
      const query = getFriendshipRequestsBaseQuery(userAddress, 'sent', { pagination })
      const results = await pg.query<FriendshipRequest>(query)
      return results.rows
    },
    async getSentFriendshipRequestsCount(userAddress) {
      const query = getFriendshipRequestsBaseQuery(userAddress, 'sent', { onlyCount: true })
      const results = await pg.query<{ count: number }>(query)
      return results.rows[0].count
    },
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

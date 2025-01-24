import SQL, { SQLStatement } from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { PoolClient } from 'pg'
import { AppComponents, Friendship, FriendshipAction, FriendshipRequest, IDatabaseComponent, Friend } from '../types'
import { FRIENDSHIPS_PER_PAGE } from './rpc-server/constants'

export function createDBComponent(components: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('db-component')

  // TODO: abstract common statements in a util file
  function getFriendsBaseQuery(userAddress: string) {
    return SQL`
      SELECT DISTINCT
        CASE
          WHEN address_requester = ${userAddress} THEN address_requested
          ELSE address_requester
        END as address,
        created_at
      FROM friendships
      WHERE (address_requester = ${userAddress} OR address_requested = ${userAddress})`
  }

  function getFriendshipRequestBaseQuery(userAddress: string, type: 'sent' | 'received'): SQLStatement {
    const columnMapping = {
      sent: SQL` f.address_requested`,
      received: SQL` f.address_requester`
    }
    const filterMapping = {
      sent: SQL`f.address_requester`,
      received: SQL`f.address_requested`
    }

    const baseQuery = SQL`SELECT fa.id,`
    baseQuery.append(columnMapping[type])
    baseQuery.append(SQL` as address`)
    baseQuery.append(SQL`
      fa.timestamp, fa.metadata
      FROM friendships f
      INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
      WHERE
    `)

    baseQuery.append(filterMapping[type].append(SQL` = ${userAddress}`))

    baseQuery.append(SQL`
      AND fa.action = 'request'
      AND f.is_active IS FALSE
      AND fa.timestamp = (
        SELECT MAX(fa2.timestamp)
        FROM friendship_actions fa2
        WHERE fa2.friendship_id = fa.friendship_id
      )
      ORDER BY fa.timestamp DESC
    `)

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
      const query: SQLStatement = SQL`SELECT COUNT(*) FROM friendships WHERE (address_requester = ${userAddress} OR address_requested = ${userAddress})`

      if (onlyActive) {
        query.append(SQL` AND is_active = true`)
      }

      const result = await pg.query<{ count: number }>(query)
      return result.rows[0].count
    },
    async getMutualFriends(userAddress1, userAddress2, pagination = { limit: FRIENDSHIPS_PER_PAGE, offset: 0 }) {
      const { limit, offset } = pagination
      const result = await pg.query<Friend>(
        SQL`WITH friendsA as (
          SELECT
            CASE
              WHEN address_requester = ${userAddress1} then address_requested
              else address_requester
            end as address
          FROM
            (
              SELECT f_a.*
              FROM friendships f_a
              WHERE
                (
                  f_a.address_requester = ${userAddress1}
                  or f_a.address_requested = ${userAddress1}
                ) and f_a.is_active = true
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
                WHEN address_requester = ${userAddress2} then address_requested
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
                    f_b.address_requester = ${userAddress2}
                    or f_b.address_requested = ${userAddress2}
                  ) and f_b.is_active = true
              ) as friends_b
          )
          ORDER BY f_b.address
          LIMIT ${limit}
          OFFSET ${offset}`
      )

      return result.rows
    },
    async getMutualFriendsCount(userAddress1, userAddress2) {
      const result = await pg.query<{ count: number }>(
        SQL`WITH friendsA as (
          SELECT
            CASE
              WHEN address_requester = ${userAddress1} THEN address_requested
              ELSE address_requester
            END as address
          FROM
            (
              SELECT f_a.*
              FROM friendships f_a
              WHERE
                (
                  f_a.address_requester = ${userAddress1}
                  OR f_a.address_requested = ${userAddress1}
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
                WHEN address_requester = ${userAddress2} THEN address_requested
                ELSE address_requester
              END as address_a
            FROM
              (
                SELECT f_b.*
                FROM friendships f_b
                WHERE
                  (
                    f_b.address_requester = ${userAddress2}
                    OR f_b.address_requested = ${userAddress2}
                  ) AND f_b.is_active = true
              ) as friends_b
          )`
      )

      return result.rows[0].count
    },
    async getFriendship(users) {
      const [userAddress1, userAddress2] = users
      const query = SQL`
        SELECT * FROM friendships 
          WHERE (address_requester, address_requested) IN ((${userAddress1}, ${userAddress2}), (${userAddress2}, ${userAddress1}))
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
      const query = SQL`
        SELECT fa.*
        FROM friendships f
        INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
        WHERE (f.address_requester, f.address_requested) IN ((${loggedUser}, ${friendUser}), (${friendUser}, ${loggedUser}))
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
      VALUES (${uuid}, ${addressRequester}, ${addressRequested}, ${isActive})
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
      logger.debug(`updating ${friendshipId} - ${isActive}`)
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
        VALUES (${uuid}, ${friendshipId}, ${action}, ${actingUser}, ${metadata})`

      if (txClient) {
        await txClient.query(query)
      } else {
        await pg.query(query)
      }

      return uuid
    },
    async getReceivedFriendshipRequests(userAddress, pagination) {
      const { limit, offset } = pagination || {}

      const query = getFriendshipRequestBaseQuery(userAddress, 'received')

      if (limit) {
        query.append(SQL` LIMIT ${limit}`)
      }

      if (offset) {
        query.append(SQL` OFFSET ${offset}`)
      }

      const results = await pg.query<FriendshipRequest>(query)

      return results.rows
    },
    async getSentFriendshipRequests(userAddress, pagination) {
      const { limit, offset } = pagination || {}
      const query = getFriendshipRequestBaseQuery(userAddress, 'sent')

      if (limit) {
        query.append(SQL` LIMIT ${limit}`)
      }

      if (offset) {
        query.append(SQL` OFFSET ${offset}`)
      }

      const results = await pg.query<FriendshipRequest>(query)

      return results.rows
    },
    async getOnlineFriends(userAddress: string, onlinePotentialFriends: string[]) {
      if (onlinePotentialFriends.length === 0) return []

      const query: SQLStatement = SQL`
        SELECT DISTINCT
          CASE
            WHEN address_requester = ${userAddress} THEN address_requested
            ELSE address_requester
          END as address
        FROM friendships
        WHERE (
          (address_requester = ${userAddress} AND address_requested IN (${onlinePotentialFriends}))
          OR
          (address_requested = ${userAddress} AND address_requester IN (${onlinePotentialFriends}))
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
        client.release()
        throw error
      }
    }
  }
}

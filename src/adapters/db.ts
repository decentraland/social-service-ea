import SQL, { SQLStatement } from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { PoolClient } from 'pg'
import { Action, AppComponents, Friendship, FriendshipAction, FriendshipRequest, Pagination } from '../types'
import { FRIENDSHIPS_COUNT_PAGE_STREAM } from './rpc-server/constants'

const getPaginationOrDefaults = (pagination?: Pagination) => {
  return pagination || { limit: FRIENDSHIPS_COUNT_PAGE_STREAM, offset: 0 }
}

export interface IDatabaseComponent {
  createFriendship(
    users: [string, string],
    isActive: boolean,
    txClient?: PoolClient
  ): Promise<{
    id: string
    created_at: Date
  }>
  updateFriendshipStatus(friendshipId: string, isActive: boolean, txClient?: PoolClient): Promise<boolean>
  getFriends(
    userAddress: string,
    options?: {
      pagination?: Pagination
      onlyActive?: boolean
    }
  ): AsyncGenerator<Friendship>
  getMutualFriends(
    userAddress1: string,
    userAddress2: string,
    pagination?: Pagination
  ): AsyncGenerator<{ address: string }>
  getFriendship(userAddresses: [string, string]): Promise<Friendship | undefined>
  getLastFriendshipAction(friendshipId: string): Promise<FriendshipAction | undefined>
  recordFriendshipAction(
    friendshipId: string,
    actingUser: string,
    action: Action,
    metadata: Record<string, any> | null,
    txClient?: PoolClient
  ): Promise<boolean>
  getReceivedFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  getSentFriendshipRequests(userAddress: string, pagination?: Pagination): Promise<FriendshipRequest[]>
  executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T>
}

export function createDBComponent(components: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('db-component')

  return {
    getFriends(userAddress, { onlyActive, pagination } = { onlyActive: true }) {
      const { limit, offset } = getPaginationOrDefaults(pagination)

      const query: SQLStatement = SQL`SELECT * FROM friendships WHERE (address_requester = ${userAddress} OR address_requested = ${userAddress})`

      if (onlyActive) {
        query.append(SQL`AND is_active = true`)
      }

      query.append(SQL`ORDER BY created_at DESC OFFSET ${offset} LIMIT ${limit}`)

      const generator = pg.streamQuery<Friendship>(query)

      return generator
    },
    getMutualFriends(userAddress1, userAddress2, pagination) {
      const { limit, offset } = getPaginationOrDefaults(pagination)
      const generator = pg.streamQuery<{ address: string }>(
        SQL`WITH friendsA as (
          SELECT
            CASE
              WHEN address_requester = ${userAddress1} then address_requested
              else address_requester
            end as address
          FROM
            (
              SELECT
                f_a.*
              from
                friendships f_a
              where
                (
                  f_a.address_requester = ${userAddress1}
                  or f_a.address_requested = ${userAddress1}
                ) and f_a.is_active = true
            ) as friends_a
        )
        SELECT
          address
        FROM
          friendsA f_b
        WHERE
          address IN (
            SELECT
              CASE
                WHEN address_requester = ${userAddress2} then address_requested
                else address_requester
              end as address_a
            FROM
              (
                SELECT
                  f_b.*
                from
                  friendships f_b
                where
                  (
                    f_b.address_requester = ${userAddress2}
                    or f_b.address_requested = ${userAddress2}
                  ) and f_b.is_active = true
              ) as friends_b
          )
          ORDER BY f_a.address
          LIMIT ${limit}
          OFFSET ${offset};`
      )

      return generator
    },
    async getFriendship(users) {
      const [userAddress1, userAddress2] = users
      const query = SQL`
        SELECT * FROM friendships 
          WHERE 
          (address_requester = ${userAddress1} AND address_requested = ${userAddress2}) 
          OR 
          (address_requester = ${userAddress2} AND address_requested = ${userAddress1})
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
    async createFriendship(users, isActive, txClient) {
      const [addressRequester, addressRequested] = users
      const uuid = randomUUID()

      const query = SQL`
      INSERT INTO friendships (id, address_requester, address_requested, is_active)
      VALUES (${uuid}, ${addressRequester}, ${addressRequested}, ${isActive})
      RETURNING id, created_at`

      const {
        rows: [{ id, created_at }]
      } = txClient ? await txClient.query(query) : await pg.query(query)

      return {
        id,
        created_at
      }
    },
    async updateFriendshipStatus(friendshipId, isActive, txClient) {
      logger.debug(`updating ${friendshipId} - ${isActive}`)
      const query = SQL`
      UPDATE friendships SET is_active = ${isActive}, updated_at = now()
      WHERE id = ${friendshipId}
      RETURNING updated_at`

      const results = txClient ? await txClient?.query(query) : await pg.query(query)
      return results.rowCount === 1
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

      return true
    },
    async getReceivedFriendshipRequests(userAddress, pagination) {
      const { limit, offset } = pagination || {}

      const query = SQL`
        SELECT f.address_requester as address, fa.timestamp, fa.metadata
          FROM friendships f
          INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
          WHERE 
            f.address_requested = ${userAddress}
            AND fa.action = 'request'
            AND f.is_active IS FALSE
            AND fa.timestamp = (
              SELECT MAX(fa2.timestamp)
              FROM friendship_actions fa2
              WHERE fa2.friendship_id = fa.friendship_id
            )
          ORDER BY fa.timestamp DESC
      `

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
      const query = SQL`
        SELECT f.address_requested as address, fa.timestamp, fa.metadata
          FROM friendships f
          INNER JOIN friendship_actions fa ON f.id = fa.friendship_id
          WHERE 
            f.address_requester = ${userAddress}
            AND fa.action = 'request'
            AND f.is_active IS FALSE
            AND fa.timestamp = (
              SELECT MAX(fa2.timestamp)
              FROM friendship_actions fa2
              WHERE fa2.friendship_id = fa.friendship_id
            )
          ORDER BY fa.timestamp DESC
      `

      if (limit) {
        query.append(SQL` LIMIT ${limit}`)
      }

      if (offset) {
        query.append(SQL` OFFSET ${offset}`)
      }

      const results = await pg.query<FriendshipRequest>(query)

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
      } catch (error) {
        logger.error(error as any)
        await client.query('ROLLBACK')
        client.release()
        throw error
      }
    }
  }
}

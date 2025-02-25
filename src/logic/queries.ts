import SQL, { SQLStatement } from 'sql-template-strings'
import { normalizeAddress } from '../utils/address'
import { Action, Pagination } from '../types'

function withAlias(tableAlias?: string): string {
  return tableAlias ? `${tableAlias}.` : ``
}

export function getFriendAddressCase(userAddress: string, tableAlias?: string): SQLStatement {
  const normalizedUserAddress = normalizeAddress(userAddress)
  return SQL`CASE
    WHEN LOWER(`
    .append(withAlias(tableAlias))
    .append(SQL`address_requester) = ${normalizedUserAddress} THEN `)
    .append(withAlias(tableAlias))
    .append(
      SQL`address_requested
    ELSE `
    )
    .append(withAlias(tableAlias)).append(SQL`address_requester
  END`)
}

export function getFriendshipCondition(userAddress: string, tableAlias: string): SQLStatement {
  const normalizedUserAddress = normalizeAddress(userAddress)
  return SQL`(LOWER(`
    .append(tableAlias)
    .append(SQL`.address_requester) = ${normalizedUserAddress} OR LOWER(`)
    .append(tableAlias)
    .append(SQL`.address_requested) = ${normalizedUserAddress})`)
}

export function getBlockingCondition(
  userAddress: string,
  friendAddressCase: SQLStatement = getFriendAddressCase(userAddress, 'f')
): SQLStatement {
  const normalizedUserAddress = normalizeAddress(userAddress)
  const query = SQL`NOT EXISTS (`
    .append(SQL`SELECT 1 FROM blocks b`)
    .append(SQL` WHERE (b.blocker_address = ${normalizedUserAddress} AND b.blocked_address = `)
    .append(friendAddressCase)
    .append(SQL`) OR (b.blocked_address = ${normalizedUserAddress} AND b.blocker_address = `)
    .append(friendAddressCase)
    .append(SQL`))`)
  return query
}

export function getFriendsBaseQuery(
  userAddress: string,
  options: { onlyActive?: boolean; pagination?: Pagination; onlyCount?: boolean } = {
    onlyActive: true,
    onlyCount: false
  }
) {
  const friendAddressCase = getFriendAddressCase(userAddress, 'f')

  const { onlyActive, onlyCount, pagination } = options

  const query: SQLStatement = SQL`SELECT DISTINCT `

  if (onlyCount) {
    query.append(SQL`COUNT(*)`)
  } else {
    query.append(friendAddressCase).append(SQL` as address, created_at`)
  }

  query.append(SQL` FROM friendships f`)
  query.append(SQL` WHERE `).append(getFriendshipCondition(userAddress, 'f'))

  if (onlyActive) {
    query.append(SQL` AND f.is_active = true`)
  }

  query.append(SQL` AND `).append(getBlockingCondition(userAddress, friendAddressCase))

  if (!onlyCount && pagination) {
    const { offset, limit } = pagination
    query.append(SQL` ORDER BY f.created_at DESC OFFSET ${offset} LIMIT ${limit}`)
  }

  return query
}

export function getFriendshipRequestsBaseQuery(
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

export function getMutualFriendsBaseQuery(
  userAddress1: string,
  userAddress2: string,
  options: { pagination?: Pagination; onlyCount?: boolean } = { onlyCount: false }
): SQLStatement {
  const normalizedUserAddress1 = normalizeAddress(userAddress1)
  const normalizedUserAddress2 = normalizeAddress(userAddress2)
  const { pagination, onlyCount } = options

  const friendsSubquery = (address: string, tableAlias: string) =>
    SQL`
    SELECT `
      .append(getFriendAddressCase(address))
      .append(
        SQL` as address
    FROM friendships `
      )
      .append(tableAlias)
      .append(SQL` WHERE `)
      .append(getFriendshipCondition(address, tableAlias))
      .append(SQL` AND `)
      .append(tableAlias).append(SQL`.is_active = true
  `)

  const query = SQL`WITH friendsA as (`.append(friendsSubquery(normalizedUserAddress1, 'f_a')).append(SQL`) SELECT `)

  if (onlyCount) {
    query.append(SQL`COUNT(address)`)
  } else {
    query.append(SQL`f_b.address`)
  }

  query
    .append(SQL` FROM friendsA f_b WHERE f_b.address IN (`)
    .append(friendsSubquery(normalizedUserAddress2, 'f_b'))
    .append(SQL`)`)

  if (!onlyCount) {
    query.append(SQL` ORDER BY f_b.address`)

    if (pagination) {
      const { limit, offset } = pagination
      query.append(SQL` LIMIT ${limit} OFFSET ${offset}`)
    }
  }

  return query
}

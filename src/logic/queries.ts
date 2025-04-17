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

export function useCTEs(CTEs: { query: SQLStatement | string; name: string }[]) {
  const CTEQuery = SQL`WITH `
  CTEs.forEach(({ query, name }, index) => {
    CTEQuery.append(name)
      .append(SQL` AS (`)
      .append(query)
      .append(SQL`)`)
    if (index < CTEs.length - 1) {
      CTEQuery.append(SQL`, `)
    }
    CTEQuery.append('\n')
  })

  return CTEQuery
}

/**
 * Returns a CTE to get the user's friends without taking into account the blocked users
 * @param userAddress - The address of the user
 * @returns A CTE for the user's friends
 */
function getUserFriendsCTE(userAddress: string) {
  return {
    query: SQL`SELECT DISTINCT
    CASE
      WHEN LOWER(f.address_requester) = ${userAddress} 
      THEN f.address_requested
      ELSE f.address_requester
    END as address, created_at
  FROM friendships f
  WHERE f.is_active = true
    AND (
      LOWER(f.address_requester) = ${userAddress}
      OR LOWER(f.address_requested) = ${userAddress}
    )`,
    name: 'user_friends'
  }
}

function getBlockedForUserCTE(userAddress: string) {
  return {
    query: SQL`SELECT DISTINCT 
      CASE WHEN LOWER(b.blocker_address) = ${userAddress}
      THEN b.blocked_address
      ELSE b.blocker_address
    END as address
    FROM blocks b
    WHERE LOWER(b.blocker_address) = ${userAddress}
      OR LOWER(b.blocked_address) = ${userAddress}`,
    name: 'blocked_for_user'
  }
}

export function getFriendsFromListBaseQuery(userAddress: string, otherUserAddresses: string[]): SQLStatement {
  const userFriendsCTE = getUserFriendsCTE(userAddress)
  const blockedForUserCTE = getBlockedForUserCTE(userAddress)
  return useCTEs([userFriendsCTE, blockedForUserCTE])
    .append(`SELECT uf.address FROM ${userFriendsCTE.name} uf `)
    .append(SQL`WHERE uf.address = ANY(${otherUserAddresses}) AND NOT EXISTS (`)
    .append(`SELECT 1 FROM ${blockedForUserCTE.name} b `)
    .append(SQL`WHERE b.address = ANY(${otherUserAddresses}))`)
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

  const baseQuery = SQL`SELECT`

  if (onlyCount) {
    baseQuery.append(SQL` COUNT(1) as count`)
  } else {
    baseQuery.append(SQL` fa.id,`)

    if (type === 'sent') {
      baseQuery.append(SQL` 
        CASE
          WHEN f.address_requester = fa.acting_user THEN f.address_requested
          ELSE f.address_requester
        END as address,`)
    } else {
      baseQuery.append(SQL` fa.acting_user as address,`)
    }

    baseQuery.append(SQL` fa.timestamp, fa.metadata`)
  }

  baseQuery.append(SQL` FROM friendship_actions fa`)
  baseQuery.append(SQL` JOIN friendships f ON f.id = fa.friendship_id AND f.is_active IS FALSE`)
  baseQuery.append(SQL` WHERE fa.action = ${Action.REQUEST}`)

  if (type === 'sent') {
    baseQuery.append(SQL` AND fa.acting_user = ${normalizedUserAddress}`)
  } else {
    baseQuery.append(SQL` AND fa.acting_user <> ${normalizedUserAddress}`)
    baseQuery.append(
      SQL` AND (f.address_requester = ${normalizedUserAddress} OR f.address_requested = ${normalizedUserAddress})`
    )
  }

  baseQuery.append(SQL` AND NOT EXISTS (
    SELECT 1 FROM friendship_actions newer
    WHERE newer.friendship_id = fa.friendship_id
    AND newer.timestamp > fa.timestamp
  )`)

  baseQuery.append(SQL` AND `).append(getBlockingCondition(userAddress))

  if (!onlyCount) {
    baseQuery.append(SQL` ORDER BY fa.timestamp DESC`)

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

  const friendsSubquery = (address: string, tableAlias: string) => {
    const friendAddressCase = getFriendAddressCase(address, tableAlias)
    return SQL`
    SELECT `
      .append(friendAddressCase)
      .append(
        SQL` as address
    FROM friendships `
      )
      .append(tableAlias)
      .append(SQL` WHERE `)
      .append(getFriendshipCondition(address, tableAlias))
      .append(SQL` AND `)
      .append(tableAlias)
      .append(SQL`.is_active = true`)
      .append(SQL` AND `)
      .append(getBlockingCondition(address, friendAddressCase))
  }

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

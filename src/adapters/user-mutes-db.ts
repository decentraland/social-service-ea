import SQL from 'sql-template-strings'
import { IUserMutesDatabaseComponent } from '../types/components'
import { AppComponents } from '../types'
import { normalizeAddress } from '../utils/address'
import { Pagination } from '../types/entities'

export function createUserMutesDBComponent({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): IUserMutesDatabaseComponent {
  const logger = logs.getLogger('user-mutes-db')

  function appendFilters(query: ReturnType<typeof SQL>, options?: { address?: string; addresses?: string[] }) {
    if (options?.address) {
      query.append(SQL` AND muted_address = ${normalizeAddress(options.address)}`)
    } else if (options?.addresses && options.addresses.length > 0) {
      const normalizedAddresses = options.addresses.map(normalizeAddress)
      query.append(SQL` AND muted_address = ANY(${normalizedAddresses})`)
    }
  }

  return {
    async addMute(muterAddress: string, mutedAddress: string): Promise<{ muted_at: Date }> {
      const query = SQL`
        INSERT INTO user_mutes (muter_address, muted_address)
        VALUES (${normalizeAddress(muterAddress)}, ${normalizeAddress(mutedAddress)})
        ON CONFLICT (muter_address, muted_address) DO UPDATE SET muter_address = user_mutes.muter_address
        RETURNING muted_at
      `

      const result = await pg.query<{ muted_at: Date }>(query)
      logger.debug(`Mute added: ${muterAddress} -> ${mutedAddress}`)
      return { muted_at: result.rows[0].muted_at }
    },

    async removeMute(muterAddress: string, mutedAddress: string): Promise<void> {
      const query = SQL`
        DELETE FROM user_mutes
        WHERE muter_address = ${normalizeAddress(muterAddress)}
          AND muted_address = ${normalizeAddress(mutedAddress)}
      `

      await pg.query(query)
      logger.debug(`Mute removed: ${muterAddress} -> ${mutedAddress}`)
    },

    async getMutedUsers(
      muterAddress: string,
      options?: { pagination?: Pagination; address?: string; addresses?: string[] }
    ): Promise<{ mutes: { address: string; muted_at: Date }[]; total: number }> {
      const countQuery = SQL`
        SELECT COUNT(*) as count FROM user_mutes
        WHERE muter_address = ${normalizeAddress(muterAddress)}
      `
      appendFilters(countQuery, options)

      const selectQuery = SQL`
        SELECT muted_address as address, muted_at FROM user_mutes
        WHERE muter_address = ${normalizeAddress(muterAddress)}
      `
      appendFilters(selectQuery, options)

      selectQuery.append(SQL` ORDER BY muted_at DESC`)

      if (options?.pagination) {
        const { limit, offset } = options.pagination
        selectQuery.append(SQL` LIMIT ${limit} OFFSET ${offset}`)
      }

      const [total, result] = await Promise.all([
        pg.getCount(countQuery),
        pg.query<{ address: string; muted_at: Date }>(selectQuery)
      ])

      return { mutes: result.rows, total }
    }
  }
}

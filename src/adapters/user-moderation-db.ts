import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { AppComponents, IUserModerationDatabaseComponent } from '../types'
import { UserBan, UserWarning, BanStatus, CreateBanInput, CreateWarningInput } from '../logic/user-moderation/types'

const BAN_SELECT_FIELDS = `id, banned_address as "bannedAddress", banned_by as "bannedBy", reason,
               custom_message as "customMessage", banned_at as "bannedAt", expires_at as "expiresAt",
               lifted_at as "liftedAt", lifted_by as "liftedBy", created_at as "createdAt"`

const ACTIVE_BAN_FILTER = `lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`

const WARNING_SELECT_FIELDS = `id, warned_address as "warnedAddress", warned_by as "warnedBy", reason,
               warned_at as "warnedAt", created_at as "createdAt"`

export function createUserModerationDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): IUserModerationDatabaseComponent {
  const { pg } = components

  return {
    async createBan(input: CreateBanInput): Promise<UserBan> {
      const id = randomUUID()

      const query = SQL`
        INSERT INTO user_bans (id, banned_address, banned_by, reason, custom_message, expires_at)
        VALUES (${id}, ${input.bannedAddress}, ${input.bannedBy}, ${input.reason}, ${input.customMessage ?? null}, ${input.expiresAt ?? null})
        RETURNING `.append(BAN_SELECT_FIELDS)

      const result = await pg.query<UserBan>(query)
      return result.rows[0]
    },

    async liftBan(address: string, liftedBy: string): Promise<boolean> {
      const query = SQL`
        UPDATE user_bans
        SET lifted_at = now(), lifted_by = ${liftedBy}
        WHERE banned_address = ${address}
          AND `.append(ACTIVE_BAN_FILTER)

      const result = await pg.query(query)
      return result.rowCount > 0
    },

    async isPlayerBanned(address: string): Promise<BanStatus> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(SQL` FROM user_bans WHERE banned_address = ${address} AND `)
        .append(ACTIVE_BAN_FILTER)

      const result = await pg.query<UserBan>(query)
      if (result.rows.length > 0) {
        return { isBanned: true, ban: result.rows[0] }
      }
      return { isBanned: false }
    },

    async getActiveBans(): Promise<UserBan[]> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(` FROM user_bans WHERE `)
        .append(ACTIVE_BAN_FILTER)
        .append(` ORDER BY banned_at DESC`)

      const result = await pg.query<UserBan>(query)
      return result.rows
    },

    async createWarning(input: CreateWarningInput): Promise<UserWarning> {
      const id = randomUUID()

      const query = SQL`
        INSERT INTO user_warnings (id, warned_address, warned_by, reason)
        VALUES (${id}, ${input.warnedAddress}, ${input.warnedBy}, ${input.reason})
        RETURNING `.append(WARNING_SELECT_FIELDS)

      const result = await pg.query<UserWarning>(query)
      return result.rows[0]
    },

    async getPlayerWarnings(address: string): Promise<UserWarning[]> {
      const query = SQL`SELECT `
        .append(WARNING_SELECT_FIELDS)
        .append(SQL` FROM user_warnings WHERE warned_address = ${address} ORDER BY warned_at DESC`)

      const result = await pg.query<UserWarning>(query)
      return result.rows
    },

    async getBanHistory(address: string): Promise<UserBan[]> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(SQL` FROM user_bans WHERE banned_address = ${address} ORDER BY banned_at DESC`)

      const result = await pg.query<UserBan>(query)
      return result.rows
    }
  }
}

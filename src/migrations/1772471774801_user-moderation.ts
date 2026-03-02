/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('user_bans', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true,
      default: pgm.func('gen_random_uuid()')
    },
    banned_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    banned_by: {
      type: PgType.VARCHAR,
      notNull: true
    },
    reason: {
      type: PgType.TEXT,
      notNull: true
    },
    custom_message: {
      type: PgType.TEXT,
      notNull: false
    },
    banned_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    expires_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    },
    lifted_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    },
    lifted_by: {
      type: PgType.VARCHAR,
      notNull: false
    },
    created_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('user_bans', 'banned_address', {
    name: 'idx_user_bans_banned_address'
  })

  pgm.createTable('user_warnings', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true,
      default: pgm.func('gen_random_uuid()')
    },
    warned_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    warned_by: {
      type: PgType.VARCHAR,
      notNull: true
    },
    reason: {
      type: PgType.TEXT,
      notNull: true
    },
    warned_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    created_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('user_warnings', 'warned_address', {
    name: 'idx_user_warnings_warned_address'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('user_warnings')
  pgm.dropTable('user_bans')
}

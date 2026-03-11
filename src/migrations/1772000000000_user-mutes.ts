/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('user_mutes', {
    muter_address: { type: PgType.VARCHAR, notNull: true },
    muted_address: { type: PgType.VARCHAR, notNull: true },
    muted_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.addConstraint('user_mutes', 'user_mutes_pkey', {
    primaryKey: ['muter_address', 'muted_address']
  })

  pgm.createIndex('user_mutes', ['muter_address'], {
    name: 'idx_user_mutes_muter_address'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('user_mutes', 'idx_user_mutes_muter_address')
  pgm.dropTable('user_mutes')
}

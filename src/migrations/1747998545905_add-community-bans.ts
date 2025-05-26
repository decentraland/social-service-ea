/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_bans', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true
    },
    community_id: {
      type: PgType.UUID,
      notNull: true,
      references: 'communities',
      onDelete: 'CASCADE'
    },
    banned_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    banned_by: {
      type: PgType.VARCHAR,
      notNull: true
    },
    banned_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    reason: {
      type: PgType.TEXT,
      notNull: false
    },
    active: {
      type: PgType.BOOLEAN,
      notNull: true,
      default: true
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_bans')
}

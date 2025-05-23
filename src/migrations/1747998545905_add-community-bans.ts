/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_bans', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true,
      default: pgm.func('uuid_generate_v4()')
    },
    community_id: {
      type: 'uuid',
      notNull: true,
      references: 'communities',
      onDelete: 'CASCADE'
    },
    banned_address: {
      type: 'varchar',
      notNull: true
    },
    banned_by: {
      type: 'varchar',
      notNull: true
    },
    banned_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    reason: {
      type: 'text',
      notNull: false
    },
    active: {
      type: 'boolean',
      notNull: true,
      default: true
    }
  })

  pgm.createIndex('community_bans', 'community_id')
  pgm.createIndex('community_bans', 'banned_address')
  pgm.createIndex('community_bans', ['community_id', 'active'])
  pgm.createIndex('community_bans', ['community_id', 'banned_address', 'active'])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('community_bans', 'banned_address')
  pgm.dropIndex('community_bans', 'community_id')
  pgm.dropIndex('community_bans', ['community_id', 'active'])
  pgm.dropIndex('community_bans', ['community_id', 'banned_address', 'active'])
  pgm.dropTable('community_bans')
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_members', {
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
    member_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    role_id: {
      type: PgType.INT,
      notNull: true,
      references: 'community_roles',
      onDelete: 'RESTRICT'
    },
    joined_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    kicked_by: {
      type: PgType.VARCHAR,
      notNull: false
    },
    kicked_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    },
    kick_reason: {
      type: PgType.TEXT,
      notNull: false
    }
  })

  pgm.createIndex('community_members', 'community_id')
  pgm.createIndex('community_members', 'member_address')
  pgm.createIndex('community_members', ['community_id', 'member_address'], { unique: true })
  pgm.createIndex('community_members', ['community_id', { name: 'role_id', sort: 'ASC' }])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('community_members', ['community_id', 'member_address'])
  pgm.dropIndex('community_members', 'member_address')
  pgm.dropIndex('community_members', 'community_id')
  pgm.dropIndex('community_members', ['community_id', { name: 'role_id', sort: 'ASC' }])
  pgm.dropTable('community_members')
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_members', {
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
    member_address: {
      type: 'varchar',
      notNull: true
    },
    role_id: {
      type: 'uuid',
      notNull: true,
      references: 'community_roles',
      onDelete: 'RESTRICT'
    },
    joined_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    kicked_by: {
      type: 'varchar',
      notNull: false
    },
    kicked_at: {
      type: 'timestamp',
      notNull: false
    },
    kick_reason: {
      type: 'text',
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

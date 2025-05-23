/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_roles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true,
      default: pgm.func('uuid_generate_v4()')
    },
    name: {
      type: 'varchar',
      notNull: true,
      unique: true
    },
    permissions: {
      type: 'jsonb',
      notNull: true,
      default: '[]'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Insert default roles
  pgm.sql(`
    INSERT INTO community_roles (name, permissions) VALUES
    ('owner', '["edit_info", "add_remove_places", "accept_reject_requests", "ban_players", "send_invitations", "edit_settings", "delete_community", "assign_roles"]'),
    ('moderator', '["edit_info", "add_remove_places", "accept_reject_requests", "ban_players", "send_invitations"]'),
    ('member', '[]')
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_roles')
}

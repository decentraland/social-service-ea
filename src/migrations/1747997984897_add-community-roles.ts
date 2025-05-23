/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_roles', {
    id: {
      type: PgType.INT,
      primaryKey: true,
      notNull: true
    },
    name: {
      type: PgType.VARCHAR,
      notNull: true,
      unique: true
    },
    permissions: {
      type: PgType.JSONB,
      notNull: true,
      default: '[]'
    },
    created_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Insert default roles
  pgm.sql(`
    INSERT INTO community_roles (id, name, permissions) VALUES
    (1, 'owner', '["edit_info", "add_remove_places", "accept_reject_requests", "ban_players", "send_invitations", "edit_settings", "delete_community", "assign_roles"]'),
    (2, 'moderator', '["edit_info", "add_remove_places", "accept_reject_requests", "ban_players", "send_invitations"]'),
    (3, 'member', '[]')
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_roles')
}

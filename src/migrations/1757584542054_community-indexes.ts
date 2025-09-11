import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Communities table indexes
  pgm.createIndex('communities', ['active'], {
    name: 'idx_communities_active'
  })

  pgm.createIndex('communities', ['active', 'private'], {
    name: 'idx_communities_active_private'
  })

  pgm.createIndex('communities', ['owner_address'], {
    name: 'idx_communities_owner_address'
  })

  // Community members table indexes
  pgm.createIndex('community_members', ['community_id', 'member_address'], {
    name: 'idx_community_members_community_member'
  })

  pgm.createIndex('community_members', ['member_address', 'community_id'], {
    name: 'idx_community_members_member_community'
  })

  pgm.createIndex('community_members', ['community_id', 'role'], {
    name: 'idx_community_members_community_role'
  })

  pgm.createIndex('community_members', ['member_address', 'role'], {
    name: 'idx_community_members_member_role'
  })

  pgm.createIndex('community_members', ['community_id', 'joined_at'], {
    name: 'idx_community_members_community_joined_at'
  })

  // Community bans table indexes
  pgm.createIndex('community_bans', ['community_id'], {
    name: 'idx_community_bans_community_id'
  })

  pgm.createIndex('community_bans', ['banned_address'], {
    name: 'idx_community_bans_banned_address'
  })

  pgm.createIndex('community_bans', ['community_id', 'banned_address'], {
    name: 'idx_community_bans_community_banned'
  })

  pgm.createIndex('community_bans', ['community_id', 'active'], {
    name: 'idx_community_bans_community_active'
  })

  pgm.createIndex('community_bans', ['banned_address', 'active'], {
    name: 'idx_community_bans_banned_active'
  })

  pgm.createIndex('community_bans', ['community_id', 'banned_address', 'active'], {
    name: 'idx_community_bans_community_banned_active'
  })

  pgm.createIndex('community_bans', ['community_id', 'banned_at'], {
    name: 'idx_community_bans_community_banned_at'
  })

  // Community places table indexes
  pgm.createIndex('community_places', ['community_id'], {
    name: 'idx_community_places_community_id'
  })

  pgm.createIndex('community_places', ['community_id', 'added_at'], {
    name: 'idx_community_places_community_added_at'
  })

  // Community requests table
  pgm.createIndex('community_requests', ['member_address', 'created_at'], {
    name: 'idx_community_requests_member_created_at'
  })

  pgm.createIndex('community_requests', ['community_id', 'created_at'], {
    name: 'idx_community_requests_community_created_at'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop community requests indexes
  pgm.dropIndex('community_requests', 'idx_community_requests_community_created_at')
  pgm.dropIndex('community_requests', 'idx_community_requests_member_created_at')

  // Drop community places indexes
  pgm.dropIndex('community_places', 'idx_community_places_community_added_at')
  pgm.dropIndex('community_places', 'idx_community_places_community_id')

  // Drop community bans indexes
  pgm.dropIndex('community_bans', 'idx_community_bans_community_banned_at')
  pgm.dropIndex('community_bans', 'idx_community_bans_community_banned_active')
  pgm.dropIndex('community_bans', 'idx_community_bans_banned_active')
  pgm.dropIndex('community_bans', 'idx_community_bans_community_active')
  pgm.dropIndex('community_bans', 'idx_community_bans_community_banned')
  pgm.dropIndex('community_bans', 'idx_community_bans_banned_address')
  pgm.dropIndex('community_bans', 'idx_community_bans_community_id')

  // Drop community members indexes
  pgm.dropIndex('community_members', 'idx_community_members_community_joined_at')
  pgm.dropIndex('community_members', 'idx_community_members_member_role')
  pgm.dropIndex('community_members', 'idx_community_members_community_role')
  pgm.dropIndex('community_members', 'idx_community_members_member_community')
  pgm.dropIndex('community_members', 'idx_community_members_community_member')

  // Drop communities indexes
  pgm.dropIndex('communities', 'idx_communities_owner_address')
  pgm.dropIndex('communities', 'idx_communities_active_private')
  pgm.dropIndex('communities', 'idx_communities_active')
}

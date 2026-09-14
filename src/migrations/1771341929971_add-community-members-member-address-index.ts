/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('community_members', ['member_address', 'community_id'], {
    name: 'idx_community_members_member_address'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('community_members', 'idx_community_members_member_address')
}

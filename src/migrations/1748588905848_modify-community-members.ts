import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_members', 'community_members_pkey')

  pgm.dropColumn('community_members', 'id')

  pgm.addConstraint('community_members', 'community_members_pkey', {
    primaryKey: ['community_id', 'member_address']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_members', 'community_members_pkey')

  pgm.addColumn('community_members', {
    id: { type: 'uuid', notNull: true, primaryKey: true, default: pgm.func('gen_random_uuid()') }
  })
}

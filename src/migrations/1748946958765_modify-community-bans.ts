/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, PgType } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_bans', 'community_bans_pkey')

  pgm.dropColumn('community_bans', 'id')

  pgm.addColumn('community_bans', {
    unbanned_by: {
      type: PgType.VARCHAR,
      notNull: false
    },
    unbanned_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    }
  })

  pgm.addConstraint('community_bans', 'community_bans_pkey', {
    primaryKey: ['community_id', 'banned_address']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_bans', 'community_bans_pkey')

  pgm.dropColumn('community_bans', 'unbanned_by')
  pgm.dropColumn('community_bans', 'unbanned_at')

  pgm.addColumn('community_bans', {
    id: { type: 'uuid', notNull: true, primaryKey: true, default: pgm.func('gen_random_uuid()') }
  })
}

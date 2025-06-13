/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_places', 'community_places_pkey')
  pgm.addConstraint('community_places', 'community_places_pkey', {
    primaryKey: ['id', 'community_id']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('community_places', 'community_places_pkey')
  pgm.addConstraint('community_places', 'community_places_pkey', {
    primaryKey: ['id']
  })
}

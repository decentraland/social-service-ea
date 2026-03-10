/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // community_places.id stored world names (ENS names like "name.dcl.eth") as the
  // canonical identifier for worlds — the Places API uses world_name as the id field
  // for world entries. Changing from UUID to TEXT allows both UUIDs (scenes) and
  // world names (worlds) to coexist.
  pgm.dropConstraint('community_places', 'community_places_pkey')
  pgm.sql('ALTER TABLE community_places ALTER COLUMN id TYPE TEXT USING id::TEXT')
  pgm.addConstraint('community_places', 'community_places_pkey', {
    primaryKey: ['id', 'community_id']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // WARNING: this will fail if any rows contain non-UUID values (world names).
  pgm.dropConstraint('community_places', 'community_places_pkey')
  pgm.sql('ALTER TABLE community_places ALTER COLUMN id TYPE UUID USING id::UUID')
  pgm.addConstraint('community_places', 'community_places_pkey', {
    primaryKey: ['id', 'community_id']
  })
}

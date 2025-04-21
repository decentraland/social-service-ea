/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Normalize address in friendships
  pgm.sql(
    `UPDATE friendships SET address_requester = LOWER(address_requester), address_requested = LOWER(address_requested) WHERE address_requester ~ '[[:upper:]]' OR address_requested ~ '[[:upper:]]'`
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('friendships', 'LOWER(address_requester) text_pattern_ops', {
    name: 'friendships_address_requester_lower',
    method: 'btree'
  })
}

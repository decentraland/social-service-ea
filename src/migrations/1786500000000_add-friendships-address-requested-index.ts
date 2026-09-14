/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

// Built concurrently: a plain CREATE INDEX holds a lock that blocks writes to friendships for the
// whole build, and that table is on the hot path for friends, requests and mutual friends.
// Concurrent builds cannot run inside a transaction.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  // Every friendship read is `(address_requester = $me OR address_requested = $me)`. Only the
  // requester arm was indexed, and the composite unique cannot serve the other one because
  // address_requester leads it, so Postgres could not build a bitmap union and scanned the table.
  pgm.createIndex('friendships', 'address_requested', {
    name: 'friendships_address_requested',
    ifNotExists: true,
    concurrently: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.dropIndex('friendships', 'address_requested', {
    name: 'friendships_address_requested',
    ifExists: true,
    concurrently: true
  })
}

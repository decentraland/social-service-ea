import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const INDEX_NAME = 'unique_pending_community_request'
const INDEX_COLUMNS = ['community_id', 'member_address', 'type']

/**
 * Adds the pending-request uniqueness invariant.
 *
 * Runs outside a transaction so the index can be built concurrently and the rollout never holds
 * a lock that blocks writes to community_requests. `pgm.noTransaction()` has to be this call —
 * node-pg-migrate only reads the builder method, and CREATE INDEX CONCURRENTLY errors inside a
 * transaction block.
 *
 * Every statement is repeated on each attempt, in this order, so a retry recovers on its own:
 * the dedupe reruns (a write that slipped in after the previous attempt is cleaned up), and the
 * drop clears any INVALID index a failed concurrent build left behind — one that enforces
 * nothing and that ON CONFLICT cannot infer.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  // Keep the oldest logical request; the invariant cannot be added while duplicates exist.
  pgm.sql(`
    DELETE FROM community_requests
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY community_id, member_address, type
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_number
        FROM community_requests
        WHERE status = 'pending'
      ) pending_duplicates
      WHERE duplicate_number > 1
    )
  `)

  pgm.dropIndex('community_requests', INDEX_COLUMNS, { name: INDEX_NAME, concurrently: true, ifExists: true })
  pgm.createIndex('community_requests', INDEX_COLUMNS, {
    name: INDEX_NAME,
    unique: true,
    where: "status = 'pending'",
    concurrently: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()
  pgm.dropIndex('community_requests', INDEX_COLUMNS, { name: INDEX_NAME, concurrently: true, ifExists: true })
}

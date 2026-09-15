/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * One friendship per pair, whichever way round it was created.
 *
 * `unique_addresses` covers the ordered columns, so A→B and B→A are different tuples and both
 * insert. Every lookup matches either direction with no `LIMIT`, so a duplicated pair makes reads
 * non-deterministic — and deactivating "the" friendship, as blocking does, leaves the other row
 * active, so the pair still reads as friends after a block.
 *
 * Existing duplicates have to be merged before the index can be created. Where a pair has more than
 * one row the active one wins, oldest first as a tiebreak: that cannot silently unfriend anyone,
 * which the reverse policy could. `friendship_actions.friendship_id` has no foreign key, so the
 * losing rows' history is repointed at the survivor rather than left orphaned — an orphaned action
 * disappears from `getLastFriendshipActionByUsers`, which inner-joins friendships, and would take
 * the state machine's view of the relationship with it.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TEMPORARY TABLE friendship_pair_survivors AS
    SELECT DISTINCT ON (LEAST(address_requester, address_requested), GREATEST(address_requester, address_requested))
      LEAST(address_requester, address_requested) AS low,
      GREATEST(address_requester, address_requested) AS high,
      id AS survivor_id
    FROM friendships
    ORDER BY
      LEAST(address_requester, address_requested),
      GREATEST(address_requester, address_requested),
      is_active DESC,
      created_at ASC,
      id ASC
  `)

  pgm.sql(`
    UPDATE friendship_actions fa
    SET friendship_id = s.survivor_id
    FROM friendships f
    JOIN friendship_pair_survivors s
      ON s.low = LEAST(f.address_requester, f.address_requested)
     AND s.high = GREATEST(f.address_requester, f.address_requested)
    WHERE fa.friendship_id = f.id
      AND f.id <> s.survivor_id
  `)

  pgm.sql(`
    DELETE FROM friendships f
    USING friendship_pair_survivors s
    WHERE s.low = LEAST(f.address_requester, f.address_requested)
      AND s.high = GREATEST(f.address_requester, f.address_requested)
      AND f.id <> s.survivor_id
  `)

  pgm.sql('DROP TABLE friendship_pair_survivors')

  pgm.sql(`
    CREATE UNIQUE INDEX friendships_unique_pair
      ON friendships (LEAST(address_requester, address_requested), GREATEST(address_requester, address_requested))
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('friendships', [], { name: 'friendships_unique_pair', ifExists: true })
}

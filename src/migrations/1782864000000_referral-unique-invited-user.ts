/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

// Enforce the invariant that an invited user can only ever be bound to a single referrer.
// The application-level check in the referral logic is racy (check-then-insert), so the
// database must guarantee uniqueness on invited_user.
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Remove any pre-existing duplicate rows, keeping the earliest referral per invited_user
  // (first legitimate referrer, tie-broken deterministically by id).
  pgm.sql(`
    DELETE FROM referral_progress
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY invited_user ORDER BY created_at ASC, id ASC) AS rn
        FROM referral_progress
      ) ranked
      WHERE ranked.rn > 1
    )
  `)

  // Replace the non-unique index with a unique one (it still serves invited_user lookups).
  pgm.dropIndex('referral_progress', ['invited_user'], {
    name: 'idx_referral_progress_invited_user',
    ifExists: true
  })
  pgm.createIndex('referral_progress', ['invited_user'], {
    name: 'unique_referral_progress_invited_user',
    unique: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_progress', ['invited_user'], {
    name: 'unique_referral_progress_invited_user',
    ifExists: true
  })
  pgm.createIndex('referral_progress', ['invited_user'], {
    name: 'idx_referral_progress_invited_user'
  })
}

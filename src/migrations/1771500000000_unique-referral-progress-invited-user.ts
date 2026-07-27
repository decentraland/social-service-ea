import { MigrationBuilder } from 'node-pg-migrate'

/**
 * Enforces one referral per invited user.
 *
 * The pre-existing unique index is on (referrer, invited_user), which still allows
 * two different referrers to claim the same invited user when two creates race:
 * both pass the "does a referral exist?" read before either inserts. This index
 * makes the invariant a database guarantee so the insert itself resolves the race.
 *
 * NOTE FOR DEPLOY: creating this index fails if the table already contains more
 * than one row per invited_user. Check before migrating:
 *
 *   SELECT invited_user, COUNT(*) FROM referral_progress
 *   GROUP BY invited_user HAVING COUNT(*) > 1;
 *
 * Any row returned is an ambiguous attribution that has to be resolved (which
 * referrer wins) before this migration can run.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('referral_progress', ['invited_user'], {
    name: 'unique_referral_progress_invited_user',
    unique: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_progress', ['invited_user'], {
    name: 'unique_referral_progress_invited_user'
  })
}

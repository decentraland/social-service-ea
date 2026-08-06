/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const referralRewardGrantsColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  referrer: { type: 'text', notNull: true },
  tier: { type: 'int', notNull: true },
  status: { type: 'text', notNull: true },
  attempts: { type: 'int', notNull: true, default: 0 },
  last_error: { type: 'text' },
  created_at: { type: 'bigint', notNull: true },
  updated_at: { type: 'bigint', notNull: true }
}

// Durable per-(referrer, tier) reward record. The unique index is the once-only guarantee:
// a tier reward can be issued at most once, and a failed attempt stays retryable.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('referral_reward_grants', referralRewardGrantsColumns)
  pgm.createIndex('referral_reward_grants', ['referrer', 'tier'], {
    name: 'unique_referral_reward_grants_referrer_tier',
    unique: true
  })

  // Backfill tiers already paid out before this table existed, so the first event after
  // deploy does not re-issue them. referral_reward_images is written only after a
  // successful sendReward, which makes it the authoritative record of past grants.
  //
  // LOWER() on both sides: the runtime keys this table by the lowercased referrer, so a
  // historical mixed-case row would otherwise backfill a grant that never collides with it.
  // Re-runnable via ON CONFLICT DO NOTHING.
  pgm.sql(`
    INSERT INTO referral_reward_grants (id, referrer, tier, status, attempts, created_at, updated_at)
    SELECT gen_random_uuid(), LOWER(referrer), tier, 'granted', 1, MIN(created_at), MIN(created_at)
    FROM referral_reward_images
    GROUP BY LOWER(referrer), tier
    ON CONFLICT (referrer, tier) DO NOTHING
  `)

  // The IRL-swag tier writes no reward image, so it cannot be recovered from the table above.
  // Reconstruct it from the accepted-invite count, or every referrer already past the threshold
  // is notified again on their next accepted invite.
  pgm.sql(`
    INSERT INTO referral_reward_grants (id, referrer, tier, status, attempts, created_at, updated_at)
    SELECT gen_random_uuid(), LOWER(referrer), 100, 'granted', 1, MAX(updated_at), MAX(updated_at)
    FROM referral_progress
    WHERE tier_granted IS TRUE
    GROUP BY LOWER(referrer)
    HAVING COUNT(*) >= 100
    ON CONFLICT (referrer, tier) DO NOTHING
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_reward_grants', ['referrer', 'tier'], {
    name: 'unique_referral_reward_grants_referrer_tier',
    ifExists: true
  })
  pgm.dropTable('referral_reward_grants')
}

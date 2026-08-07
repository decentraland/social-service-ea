/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const referralRewardGrantsColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  referrer: { type: 'text', notNull: true },
  tier: { type: 'int', notNull: true },
  status: { type: 'text', notNull: true },
  attempts: { type: 'int', notNull: true, default: 0 },
  // Fencing token, rotated on every winning claim. Closing or parking a claim must match it,
  // so a worker whose lease expired mid-issuance cannot write over the claim that superseded it.
  claim_token: { type: 'uuid', notNull: true },
  last_error: { type: 'text' },
  created_at: { type: 'bigint', notNull: true },
  updated_at: { type: 'bigint', notNull: true }
}

// Durable per-(referrer, tier) reward record. The unique index is the once-only guarantee:
// a tier reward can be issued at most once. Status is one of 'pending' (claimable),
// 'granted' (closed for good) or 'needs_manual_review' (issuance outcome unknown, so it is
// held out of the retry loop until someone confirms it against the reward provider).
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
    INSERT INTO referral_reward_grants (id, referrer, tier, status, attempts, claim_token, created_at, updated_at)
    SELECT gen_random_uuid(), LOWER(referrer), tier, 'granted', 1, gen_random_uuid(), MIN(created_at), MIN(created_at)
    FROM referral_reward_images
    GROUP BY LOWER(referrer), tier
    ON CONFLICT (referrer, tier) DO NOTHING
  `)

  // WHAT THIS BACKFILL CANNOT RECOVER
  //
  // The old flow issued the reward and only then wrote the image row, both inside the same
  // Promise.all. A grant is therefore unrecoverable when sendReward succeeded but that INSERT
  // never committed — a process crash or database failure inside a window of milliseconds.
  // Those tiers look untouched here and will be issued a second time by the first event after
  // deploy. The window is narrow but not empty, and nothing in this schema records it: the old
  // flow wrote no marker between "reward issued" and "image row written". Reconciling it needs
  // the reward provider's own records, which this service cannot read.
  //
  // Everything else that looks like a hole is NOT one, and must not be backfilled as granted:
  //
  //   - The old flow gated on `TIERS.includes(acceptedInvites)` — exact equality. A count that
  //     jumped a boundary (concurrent finalizes) never issued that tier at all. The `<=` sweep
  //     this change introduces exists precisely to pay those.
  //   - Referrals finalized between the referral tables (2025-06-18) and the rewards adapter
  //     (2025-07-01) set tier_granted with no reward code deployed, so every boundary crossed
  //     in that window is genuinely unpaid.
  //
  // Both are indistinguishable from the crash window using only this schema, so the tempting
  // "backfill every tier <= accepted-invite count as granted" is unsound in the expensive
  // direction: it would permanently deny a large population of definitely-unpaid rewards to
  // suppress a small population of possible duplicates. Ops can enumerate the ambiguous set
  // (crossed tiers with no image row) with:
  //
  //   SELECT p.referrer, t.tier
  //   FROM (SELECT LOWER(referrer) AS referrer, COUNT(*) AS accepted
  //         FROM referral_progress WHERE tier_granted IS TRUE GROUP BY LOWER(referrer)) p
  //   CROSS JOIN (VALUES (5),(10),(20),(25),(30),(50),(60),(75)) AS t(tier)
  //   LEFT JOIN referral_reward_grants g ON g.referrer = p.referrer AND g.tier = t.tier
  //   WHERE t.tier <= p.accepted AND g.id IS NULL;

  // The IRL-swag tier writes no reward image, so it cannot be recovered from the table above.
  // Reconstruct it from the accepted-invite count. Unlike the reward tiers this uses >= rather
  // than the old flow's exact `=== 100`, so a referrer who jumped the boundary is treated as
  // already notified: being wrong here costs one missed Slack message, not a duplicate NFT.
  pgm.sql(`
    INSERT INTO referral_reward_grants (id, referrer, tier, status, attempts, claim_token, created_at, updated_at)
    SELECT gen_random_uuid(), LOWER(referrer), 100, 'granted', 1, gen_random_uuid(), MAX(updated_at), MAX(updated_at)
    FROM referral_progress
    WHERE tier_granted IS TRUE
    GROUP BY LOWER(referrer)
    HAVING COUNT(*) >= 100
    ON CONFLICT (referrer, tier) DO NOTHING
  `)
}

// Deliberately irreversible. This table is the only record that a tier reward was issued: the
// runtime closes a grant before the best-effort image insert, so rows here have no counterpart
// anywhere else and the `up` backfill above could not rebuild them. Dropping it and re-running
// `up` would pay those tiers a second time. Removing the table is a manual, reviewed operation.
export const down = false

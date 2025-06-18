import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const ReferralProgressColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  referrer: { type: 'text', notNull: true },
  invited_user: { type: 'text', notNull: true },
  status: { type: 'text', notNull: true },
  signed_up_at: { type: 'bigint' },
  tier_granted: { type: 'boolean', notNull: true, default: false },
  tier_granted_at: { type: 'bigint' },
  created_at: { type: 'bigint', notNull: true },
  updated_at: { type: 'bigint', notNull: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('referral_progress', ReferralProgressColumns)
  pgm.createIndex('referral_progress', ['referrer', 'invited_user'], {
    name: 'unique_referral_progress_referrer_invited_user',
    unique: true
  })
  pgm.createIndex('referral_progress', ['invited_user'], {
    name: 'idx_referral_progress_invited_user'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_progress', 'unique_referral_progress_referrer_invited_user')
  pgm.dropIndex('referral_progress', 'idx_referral_progress_invited_user')
  pgm.dropTable('referral_progress')
}

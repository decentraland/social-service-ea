import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const ReferralInvitedUsersSeenColumns: ColumnDefinitions = {
  referrer: { type: 'text', primaryKey: true, notNull: true },
  invites_accepted_viewed: { type: 'int', notNull: true, default: 0 },
  updated_at: { type: 'bigint', notNull: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('referral_progress_viewed', ReferralInvitedUsersSeenColumns)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('referral_progress_viewed')
}

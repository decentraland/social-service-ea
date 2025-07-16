import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const ReferralProgressColumns: ColumnDefinitions = {
  invited_user_ip: { type: 'text' }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('referral_progress', ReferralProgressColumns)
  pgm.createIndex('referral_progress', ['invited_user_ip'], {
    name: 'idx_referral_progress_invited_user_ip'
  })
  pgm.createIndex('referral_progress', ['referrer', 'invited_user_ip'], {
    name: 'idx_referral_progress_referrer_invited_user_ip'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_progress', 'idx_referral_progress_invited_user_ip')
  pgm.dropIndex('referral_progress', 'idx_referral_progress_referrer_invited_user_ip')
  pgm.dropColumn('referral_progress', 'invited_user_ip')
}

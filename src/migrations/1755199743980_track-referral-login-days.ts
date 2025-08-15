import { ColumnDefinitions, MigrationBuilder, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('referral_progress', {
    first_login_at: { type: 'bigint' }
  })

  pgm.createIndex('referral_progress', ['first_login_at'], {
    name: 'idx_referral_progress_first_login_at'
  })

  pgm.createIndex('referral_progress', ['invited_user', 'first_login_at'], {
    name: 'idx_referral_progress_invited_user_first_login_at'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_progress', 'idx_referral_progress_first_login_at')
  pgm.dropIndex('referral_progress', 'idx_referral_progress_invited_user_first_login_at')

  pgm.dropColumn('referral_progress', 'first_login_at')
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const referralEmailsColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  referrer: { type: 'text', notNull: true },
  email: { type: 'text', notNull: true },
  created_at: { type: 'bigint', notNull: true },
  updated_at: { type: 'bigint', notNull: true }
}

export const referralRewardImagesColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  referrer: { type: 'text', notNull: true },
  reward_image_url: { type: 'text', notNull: true },
  tier: { type: 'int', notNull: true },
  created_at: { type: 'bigint', notNull: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('referral_emails', referralEmailsColumns)
  pgm.createIndex('referral_emails', ['referrer'], {
    name: 'idx_referral_emails_referrer'
  })
  pgm.createIndex('referral_emails', ['email'], {
    name: 'idx_referral_emails_email'
  })

  pgm.createTable('referral_reward_images', referralRewardImagesColumns)
  pgm.createIndex('referral_reward_images', ['referrer'], {
    name: 'idx_referral_reward_images_referrer'
  })
  pgm.createIndex('referral_reward_images', ['tier'], {
    name: 'idx_referral_reward_images_tier'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('referral_emails', 'idx_referral_emails_referrer')
  pgm.dropIndex('referral_emails', 'idx_referral_emails_email')
  pgm.dropTable('referral_emails')

  pgm.dropIndex('referral_reward_images', 'idx_referral_reward_images_referrer')
  pgm.dropIndex('referral_reward_images', 'idx_referral_reward_images_tier')
  pgm.dropTable('referral_reward_images')
}

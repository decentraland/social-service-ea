/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'
import { BlockedUsersMessagesVisibilitySetting, PrivateMessagesPrivacy } from '../types'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('social_settings', {
    address: {
      type: 'varchar(42)',
      primaryKey: true,
      notNull: true
    },
    private_messages_privacy: {
      type: PgType.VARCHAR,
      notNull: true,
      default: PrivateMessagesPrivacy.ONLY_FRIENDS
    },
    blocked_users_messages_visibility: {
      type: PgType.VARCHAR,
      notNull: true,
      default: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }
  })

  // The private_messages_privacy must be checked to ensure it only contains valid values
  pgm.addConstraint('social_settings', 'valid_private_messages_privacy', {
    check: `private_messages_privacy IN (${Object.values(PrivateMessagesPrivacy)
      .map((value) => `'${value}'`)
      .join(', ')})`
  })

  // The blocked_users_messages_visibility must be checked to ensure it only contains valid values
  pgm.addConstraint('social_settings', 'valid_blocked_users_messages_visibility', {
    check: `blocked_users_messages_visibility IN (${Object.values(BlockedUsersMessagesVisibilitySetting)
      .map((value) => `'${value}'`)
      .join(', ')})`
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('social_settings', 'valid_private_messages_privacy')
  pgm.dropConstraint('social_settings', 'valid_blocked_users_messages_visibility')
  pgm.dropTable('social_settings')
}

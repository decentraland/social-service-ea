/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('private_voice_chats', 'expires_at')
  pgm.dropColumn('private_voice_chats', 'updated_at')
  pgm.addIndex('private_voice_chats', 'created_at')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('private_voice_chats', {
    expires_at: {
      type: PgType.TIMESTAMP,
      notNull: true
    }
  })
  pgm.addColumn('private_voice_chats', {
    updated_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })
  pgm.addConstraint('private_voice_chats', 'private_voice_chats_expires_at_check', {
    check: 'expires_at > now()'
  })
}

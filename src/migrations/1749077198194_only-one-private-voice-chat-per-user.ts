/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. A user can't call themselves
  pgm.createConstraint('private_voice_chats', 'private_voice_chats_no_self_call_check', {
    check: 'caller_address != callee_address'
  })

  // 2. A user can't be calling more than one user at the same time
  pgm.createConstraint('private_voice_chats', 'private_voice_chats_unique_caller', {
    unique: ['caller_address']
  })

  // 3. A user can't be receiving calls from more than one user at the same time
  pgm.createConstraint('private_voice_chats', 'private_voice_chats_unique_callee', {
    unique: ['callee_address']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop constraints in reverse order
  pgm.dropConstraint('private_voice_chats', 'private_voice_chats_unique_callee')
  pgm.dropConstraint('private_voice_chats', 'private_voice_chats_unique_caller')
  pgm.dropConstraint('private_voice_chats', 'private_voice_chats_no_self_call_check')
}

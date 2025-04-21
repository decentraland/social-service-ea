import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Address indexes + constraints
  pgm.createIndex('friendships', 'address_requester', { name: 'friendships_address_requester', method: 'hash' })

  pgm.createConstraint('friendships', 'unique_addresses', {
    unique: ['address_requester', 'address_requested']
  })

  // Lowercase indexes
  pgm.createIndex('friendships', 'LOWER(address_requester) text_pattern_ops', {
    name: 'friendships_address_requester_lower',
    method: 'btree'
  })

  // Friendship history index
  pgm.createIndex('friendship_actions', 'friendship_id', { name: 'friendship_actions_friendship_id' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('friendships', 'friendships_address_requester')
  pgm.dropConstraint('friendships', 'unique_addresses')
  pgm.dropIndex('friendships', 'friendships_address_requested_lower')
  pgm.dropIndex('friendship_actions', 'friendship_actions_friendship_id')
}

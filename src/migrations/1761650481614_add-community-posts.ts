import { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('community_posts', {
    id: {
      type: 'UUID',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    community_id: {
      type: 'UUID',
      notNull: true,
      references: 'communities(id)',
      onDelete: 'CASCADE'
    },
    author_address: {
      type: 'VARCHAR',
      notNull: true
    },
    content: {
      type: 'TEXT',
      notNull: true
    },
    created_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Indexes for efficient queries
  pgm.createIndex('community_posts', 'community_id')
  pgm.createIndex('community_posts', 'author_address')
  pgm.createIndex('community_posts', ['community_id', 'created_at'], {
    name: 'community_posts_community_created_idx'
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('community_posts')
}

import { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('community_post_likes', {
    post_id: {
      type: 'UUID',
      notNull: true,
      references: 'community_posts(id)',
      onDelete: 'CASCADE'
    },
    user_address: {
      type: 'VARCHAR',
      notNull: true
    },
    liked_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Composite primary key on (post_id, user_address)
  pgm.addConstraint('community_post_likes', 'community_post_likes_pkey', {
    primaryKey: ['post_id', 'user_address']
  })

  // Index on post_id for efficient like counting
  pgm.createIndex('community_post_likes', 'post_id')
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropIndex('community_post_likes', 'post_id')
  pgm.dropTable('community_post_likes')
}

import { ColumnDefinitions, MigrationBuilder, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_requests', {
    id: {
      type: PgType.UUID,
      primaryKey: true
    },
    community_id: {
      type: PgType.UUID,
      notNull: true,
      references: 'communities',
      onDelete: 'CASCADE'
    },
    member_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    status: {
      type: PgType.VARCHAR,
      notNull: true,
      default: 'pending'
    },
    type: {
      type: PgType.VARCHAR,
      notNull: true
    },
    created_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('community_requests', ['community_id', 'type', 'status'], {
    name: 'idx_community_requests_community_type_status'
  })

  pgm.createIndex('community_requests', ['community_id', 'status'], {
    name: 'idx_community_requests_community_status'
  })

  pgm.createIndex('community_requests', ['member_address', 'type', 'status'], {
    name: 'idx_community_requests_member_type_status'
  })

  pgm.createIndex('community_requests', ['community_id', 'member_address', 'type', 'status'], {
    name: 'idx_community_requests_community_member_type_status'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('community_requests', 'idx_community_requests_community_type_status')
  pgm.dropIndex('community_requests', 'idx_community_requests_community_status')
  pgm.dropIndex('community_requests', 'idx_community_requests_member_type_status')
  pgm.dropIndex('community_requests', 'idx_community_requests_community_member_type_status')

  pgm.dropTable('community_requests')
}

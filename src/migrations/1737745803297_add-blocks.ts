import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('blocks', {
    id: {
      type: PgType.UUID,
      primaryKey: true
    },
    blocker_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    blocked_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    blocked_at: {
      type: PgType.TIMESTAMP,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('blocks', ['blocker_address'])
  pgm.createIndex('blocks', ['blocked_address'])
  pgm.createIndex('blocks', ['blocker_address', 'blocked_address'], { unique: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('blocks')
  pgm.dropIndex('blocks', ['blocker_address'])
  pgm.dropIndex('blocks', ['blocked_address'])
  pgm.dropIndex('blocks', ['blocker_address', 'blocked_address'])
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('calls', {
    id: {
      type: PgType.UUID,
      primaryKey: true
    },
    caller_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    callee_address: {
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
    },
    expires_at: {
      type: PgType.TIMESTAMP,
      default: pgm.func("now() + interval '1 hour'"),
      notNull: true
    }
  })

  pgm.createIndex('calls', 'caller_address')
  pgm.createIndex('calls', 'callee_address')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('calls')
  pgm.dropIndex('calls', 'caller_address')
  pgm.dropIndex('calls', 'callee_address')
}

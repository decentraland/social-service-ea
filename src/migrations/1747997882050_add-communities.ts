/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('communities', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true
    },
    name: {
      type: PgType.VARCHAR,
      notNull: true
    },
    description: {
      type: PgType.TEXT,
      notNull: true
    },
    owner_address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    thumbnail_url: {
      type: PgType.VARCHAR,
      notNull: false
    },
    private: {
      type: PgType.BOOLEAN,
      notNull: true,
      default: false
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
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('communities')
}

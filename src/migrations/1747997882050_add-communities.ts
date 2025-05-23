/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('communities', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true,
      default: pgm.func('uuid_generate_v4()')
    },
    name: {
      type: 'varchar',
      notNull: true
    },
    description: {
      type: 'text',
      notNull: true
    },
    owner_address: {
      type: 'varchar',
      notNull: true
    },
    thumbnail_url: {
      type: 'varchar',
      notNull: false
    },
    places: {
      type: 'varchar[]',
      notNull: true,
      default: '{}'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('communities', 'owner_address')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('communities', 'owner_address')
  pgm.dropTable('communities')
}

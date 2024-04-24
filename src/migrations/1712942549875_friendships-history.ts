/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('friendship_actions', {
    id: {
      type: PgType.UUID,
      primaryKey: true
    },
    friendship_id: {
      type: PgType.UUID,
      notNull: true
    },
    action: {
      type: PgType.VARCHAR,
      notNull: true
    },
    acting_user: {
      type: PgType.VARCHAR,
      notNull: true
    },
    metadata: {
      type: PgType.JSON,
      notNull: false
    },
    timestamp: {
      type: PgType.TIMESTAMP,
      default: pgm.func('now()')
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('friendship_actions')
}

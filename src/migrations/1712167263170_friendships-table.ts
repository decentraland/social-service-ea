/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('friendships', {
    id: {
      type: PgType.UUID,
      primaryKey: true
    },
    address_requester: {
      type: PgType.VARCHAR,
      notNull: true
    },
    address_requested: {
      type: PgType.VARCHAR,
      notNull: true
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('friendships')
}

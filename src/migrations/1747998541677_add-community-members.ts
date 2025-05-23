/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_members', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true
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
    role: {
      type: PgType.VARCHAR,
      notNull: true
    },
    joined_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_members')
}

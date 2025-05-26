/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_places', {
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
    place_type: {
      type: PgType.VARCHAR,
      notNull: true
    },
    position: {
      type: PgType.JSONB,
      notNull: true
    },
    world_name: {
      type: PgType.VARCHAR,
      notNull: true
    },
    added_by: {
      type: PgType.VARCHAR,
      notNull: true
    },
    added_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_places')
}

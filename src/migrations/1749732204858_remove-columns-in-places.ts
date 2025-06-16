/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('community_places', ['place_type', 'position', 'world_name'], { ifExists: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(
    'community_places',
    {
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
      }
    },
    { ifNotExists: true }
  )
}

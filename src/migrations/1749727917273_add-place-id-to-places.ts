/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('community_places', {
    place_id: {
      type: PgType.UUID,
      notNull: true
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('community_places', 'place_id')
}

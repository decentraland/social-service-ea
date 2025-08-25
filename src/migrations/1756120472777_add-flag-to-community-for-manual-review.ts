import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions = {}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('communities', {
    needs_manual_review: {
      type: 'boolean',
      notNull: true,
      default: false
    }
  })

  pgm.createIndex('communities', 'needs_manual_review')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('communities', 'needs_manual_review')
  pgm.dropColumn('communities', 'needs_manual_review')
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'
import { SituationReactionsVisibility } from '../types'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('social_settings', {
    show_situation_reactions: {
      type: PgType.VARCHAR,
      notNull: true,
      default: SituationReactionsVisibility.SHOW
    }
  })

  pgm.addConstraint('social_settings', 'valid_show_situation_reactions', {
    check: `show_situation_reactions IN (${Object.values(SituationReactionsVisibility)
      .map((value) => `'${value}'`)
      .join(', ')})`
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('social_settings', 'valid_show_situation_reactions')
  pgm.dropColumn('social_settings', 'show_situation_reactions')
}

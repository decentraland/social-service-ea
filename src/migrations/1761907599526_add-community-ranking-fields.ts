/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('communities', {
    ranking_score: {
      type: PgType.FLOAT4,
      notNull: true,
      default: 0
    },
    editors_choice: {
      type: PgType.BOOLEAN,
      notNull: true,
      default: false
    },
    last_score_calculated_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    }
  })

  // Index for efficient sorting by ranking (editors_choice DESC, ranking_score DESC, name ASC)
  // This supports the most common query pattern: filtering active/unlisted communities and sorting by ranking
  pgm.createIndex('communities', ['editors_choice DESC', 'ranking_score DESC', 'name ASC'], {
    name: 'idx_communities_ranking_sort',
    where: 'active = true AND unlisted = false'
  })

  // Index for ranking job to find communities that need score recalculation
  pgm.createIndex('communities', 'last_score_calculated_at', {
    name: 'idx_communities_last_score_calculated_at',
    where: 'active = true'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('communities', 'idx_communities_last_score_calculated_at')
  pgm.dropIndex('communities', 'idx_communities_ranking_sort')
  pgm.dropColumn('communities', 'ranking_score')
  pgm.dropColumn('communities', 'editors_choice')
  pgm.dropColumn('communities', 'last_score_calculated_at')
}

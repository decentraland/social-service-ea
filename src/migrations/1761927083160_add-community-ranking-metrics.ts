/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_ranking_metrics', {
    community_id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true,
      references: 'communities(id)',
      onDelete: 'CASCADE'
    },
    events_count: {
      type: PgType.INTEGER,
      notNull: true,
      default: 0
    },
    photos_count: {
      type: PgType.INTEGER,
      notNull: true,
      default: 0
    },
    streams_count: {
      type: PgType.INTEGER,
      notNull: true,
      default: 0
    },
    events_total_attendees: {
      type: PgType.INTEGER,
      notNull: true,
      default: 0
    },
    streams_total_participants: {
      type: PgType.INTEGER,
      notNull: true,
      default: 0
    },
    has_thumbnail: {
      type: PgType.BOOLEAN,
      notNull: true,
      default: false
    },
    updated_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Index for efficient updates
  pgm.createIndex('community_ranking_metrics', 'updated_at', {
    name: 'idx_community_ranking_metrics_updated_at'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('community_ranking_metrics', 'idx_community_ranking_metrics_updated_at')
  pgm.dropTable('community_ranking_metrics')
}

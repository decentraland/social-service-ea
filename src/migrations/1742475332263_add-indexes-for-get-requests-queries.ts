/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const indexes = {
  friendship_actions: [
    ['friendship_id', 'timestamp DESC'],
    ['LOWER(acting_user)', 'action'],
    ['timestamp DESC'],
    ['LOWER(acting_user)']
  ],
  friendships: [['is_active', 'LOWER(address_requester)', 'LOWER(address_requested)']]
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  Object.entries(indexes).forEach(([table, columnsIndexes]) => {
    columnsIndexes.forEach((columns) => {
      pgm.createIndex(table, columns)
    })
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  Object.entries(indexes).forEach(([table, columnsIndexes]) => {
    columnsIndexes.forEach((columns) => {
      pgm.dropIndex(table, columns)
    })
  })
}

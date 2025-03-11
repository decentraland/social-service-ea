import { Pool } from 'pg'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({
  path: `.env.${process.env.NODE_ENV || 'local'}`
})

const oldDbConfig = {
  host: process.env.OLD_DB_HOST,
  port: parseInt(process.env.OLD_DB_PORT || '5432', 10),
  user: process.env.OLD_DB_USER,
  password: process.env.OLD_DB_PASSWORD,
  database: process.env.OLD_DB_NAME
}

const newDbConfig = {
  host: process.env.NEW_DB_HOST,
  port: parseInt(process.env.NEW_DB_PORT || '5432', 10),
  user: process.env.NEW_DB_USER,
  password: process.env.NEW_DB_PASSWORD,
  database: process.env.NEW_DB_NAME
}

const oldDbPool = new Pool(oldDbConfig)
const newDbPool = new Pool(newDbConfig)

const BATCH_SIZE = 1000

async function migrateFriendships() {
  let offset = 0
  let hasMoreData = true
  const failedBatches: number[][] = []

  console.log('Starting friendships migration...')

  while (hasMoreData) {
    try {
      const result = await oldDbPool.query(
        `SELECT id, address_1, address_2, is_active
          FROM friendships
          ORDER BY id
          LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      )

      if (result.rows.length === 0) {
        hasMoreData = false
        break
      }

      const values = result.rows.map((row) => [row.id, row.is_active, row.address_2, row.address_1])

      const placeholders = values
        .map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, NOW(), NOW())`)
        .join(',')

      await newDbPool.query(
        `INSERT INTO friendships (id, is_active, address_requested, address_requester, created_at, updated_at)
          VALUES ${placeholders}
          ON CONFLICT (address_requester, address_requested) DO UPDATE 
          SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
        values.flat()
      )

      console.log(`Migrated ${result.rows.length} friendships (offset: ${offset})`)
    } catch (error) {
      console.log(`[ERROR] Error migrating friendships batch (offset: ${offset}):`, error)
      const ids = (
        await oldDbPool.query(`SELECT id FROM friendships ORDER BY id LIMIT $1 OFFSET $2`, [BATCH_SIZE, offset])
      ).rows.map((row) => row.id)

      failedBatches.push(ids)
    }

    offset += BATCH_SIZE
  }

  if (failedBatches.length > 0) {
    console.log('[ERROR] Failed friendship batches:', failedBatches.length)
    fs.writeFileSync('failed-friendships-batches.json', JSON.stringify(failedBatches))
  }

  console.log('Friendships migration completed.')
}

async function migrateFriendshipHistory() {
  let offset = 0
  let hasMoreData = true
  const failedBatches: number[][] = []

  console.log('Starting friendship history migration...')

  while (hasMoreData) {
    try {
      const result = await oldDbPool.query(
        `SELECT id, timestamp, event, metadata, friendship_id, acting_user
          FROM friendship_history
          ORDER BY id
          LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      )

      if (result.rows.length === 0) {
        hasMoreData = false
        break
      }

      const values = result.rows.map((row) => [
        row.id,
        row.timestamp,
        row.event.replace(/^"|"$/g, '').trim().toLowerCase(),
        row.metadata,
        row.friendship_id,
        row.acting_user
      ])

      const placeholders = values
        .map(
          (_, index) =>
            `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`
        )
        .join(',')

      await newDbPool.query(
        `INSERT INTO friendship_actions (id, timestamp, action, metadata, friendship_id, acting_user)
          VALUES ${placeholders}
          ON CONFLICT (id) DO NOTHING`,
        values.flat()
      )

      console.log(`Migrated ${result.rows.length} friendship history records (offset: ${offset})`)
    } catch (error) {
      console.log(`[ERROR] Error migrating friendship history batch (offset: ${offset}):`, error)
      const ids = (
        await oldDbPool.query(`SELECT id FROM friendship_history ORDER BY id LIMIT $1 OFFSET $2`, [BATCH_SIZE, offset])
      ).rows.map((row) => row.id)

      failedBatches.push(ids)
    }

    offset += BATCH_SIZE
  }

  if (failedBatches.length > 0) {
    console.log('[ERROR] Failed friendship history batches:', failedBatches.length)
    fs.writeFileSync('failed-friendship-history-batches.json', JSON.stringify(failedBatches))
  }

  console.log('Friendship history migration completed.')
}

async function migrateData() {
  try {
    console.log('Starting data migration...')
    await migrateFriendships()
    await migrateFriendshipHistory()
    console.log('Data migration completed.')
  } catch (error) {
    console.log('[ERROR] Error during data migration:', error)
  } finally {
    await oldDbPool.end()
    await newDbPool.end()
    console.log('Connections closed.')
  }
}

async function main() {
  await migrateData()
}

main().catch((error) => {
  console.log('[ERROR] Error in main execution:', error)
  process.exit(1)
})

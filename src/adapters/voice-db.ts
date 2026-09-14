import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { AppComponents, IVoiceDatabaseComponent, PrivateVoiceChat } from '../types'
import { normalizeAddress } from '../utils/address'

/**
 * Creates the private-voice persistence component.
 *
 * Pending-call creation serializes both participants before checking and inserting so an address
 * cannot concurrently occupy either side of multiple calls.
 *
 * @param components Required PostgreSQL and configuration components.
 * @returns The private-voice database component.
 */
export async function createVoiceDBComponent(
  components: Pick<AppComponents, 'pg' | 'config'>
): Promise<IVoiceDatabaseComponent> {
  const { pg, config } = components
  // Private voice chat expiration time in milliseconds
  const PRIVATE_VOICE_CHAT_EXPIRATION_TIME = await config.requireNumber('PRIVATE_VOICE_CHAT_EXPIRATION_TIME')

  return {
    async areUsersBeingCalledOrCallingSomeone(userAddresses: string[]): Promise<boolean> {
      const normalizedUserAddresses = userAddresses.map(normalizeAddress)

      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM private_voice_chats WHERE caller_address = ANY(${normalizedUserAddresses}) OR callee_address = ANY(${normalizedUserAddresses})
        )
      `
      return pg.exists(query, 'exists')
    },
    async createPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string | null> {
      const normalizedCaller = normalizeAddress(callerAddress)
      const normalizedCallee = normalizeAddress(calleeAddress)
      const participants = [normalizedCaller, normalizedCallee].sort()

      return pg.withTransaction(async (client) => {
        // Every call involving either participant takes these locks in the same order. This enforces
        // uniqueness across both caller/callee columns, which independent unique indexes cannot do.
        for (const participant of participants) {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`private-voice:${participant}`])
        }

        const busyParticipant = await client.query(
          `SELECT 1 FROM private_voice_chats
           WHERE caller_address = ANY($1::varchar[]) OR callee_address = ANY($1::varchar[])
           LIMIT 1`,
          [participants]
        )
        if ((busyParticipant.rowCount ?? 0) > 0) return null

        const query = SQL`
          INSERT INTO private_voice_chats (id, caller_address, callee_address)
          VALUES (${randomUUID()}, ${normalizedCaller}, ${normalizedCallee})
          RETURNING id
        `
        const results = await client.query<{ id: string }>(query.text, query.values)
        return results.rows[0].id
      })
    },
    async getPrivateVoiceChat(callId: string): Promise<PrivateVoiceChat | null> {
      const query = SQL`
        SELECT * FROM private_voice_chats WHERE id = ${callId}
      `
      const results = await pg.query<PrivateVoiceChat>(query)
      return results.rows[0] ?? null
    },
    async getPrivateVoiceChatForCalleeAddress(calleeAddress: string): Promise<PrivateVoiceChat | null> {
      const query = SQL`
        SELECT * FROM private_voice_chats WHERE callee_address = ${normalizeAddress(calleeAddress)}
      `
      const results = await pg.query<PrivateVoiceChat>(query)
      return results.rows[0] ?? null
    },
    async getPrivateVoiceChatOfUser(address: string): Promise<PrivateVoiceChat | null> {
      const query = SQL`
        SELECT * FROM private_voice_chats WHERE caller_address = ${normalizeAddress(address)} OR callee_address = ${normalizeAddress(address)}
      `
      const results = await pg.query<PrivateVoiceChat>(query)
      return results.rows[0] ?? null
    },
    async deletePrivateVoiceChat(callId: string): Promise<PrivateVoiceChat | null> {
      const query = SQL`
        DELETE FROM private_voice_chats WHERE id = ${callId} RETURNING *;
      `
      const results = await pg.query<PrivateVoiceChat>(query)
      return results.rows[0] ?? null
    },
    /**
     * Expire private voice chats that are older than the given date.
     * @param limit - The maximum number of voice chats to expire.
     */
    async expirePrivateVoiceChat(limit: number): Promise<PrivateVoiceChat[]> {
      const query = SQL`DELETE FROM private_voice_chats WHERE id IN (
        SELECT id FROM private_voice_chats WHERE 
          created_at < (now()::timestamp - (${PRIVATE_VOICE_CHAT_EXPIRATION_TIME} * interval '1 millisecond'))
        ORDER BY created_at ASC
        LIMIT ${limit})
      RETURNING *;`
      const results = await pg.query<PrivateVoiceChat>(query)
      return results.rows
    }
  }
}

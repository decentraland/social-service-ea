import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { AppComponents, IVoiceDatabaseComponent } from '../types'
import { normalizeAddress } from '../utils/address'

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
          SELECT 1 FROM private_voice_chats WHERE caller_address IN (${normalizedUserAddresses}) OR callee_address IN (${normalizedUserAddresses})
        )
      `
      const results = await pg.query<{ exists: boolean }>(query)
      return results.rows[0].exists
    },
    async createPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string> {
      const query = SQL`
        INSERT INTO private_voice_chats (id, caller_address, callee_address, expires_at)
        VALUES (${randomUUID()}, ${normalizeAddress(callerAddress)}, ${normalizeAddress(calleeAddress)}, ${new Date(Date.now() + PRIVATE_VOICE_CHAT_EXPIRATION_TIME).toISOString()})
        RETURNING id
      `
      const results = await pg.query<{ id: string }>(query)
      return results.rows[0].id
    }
  }
}

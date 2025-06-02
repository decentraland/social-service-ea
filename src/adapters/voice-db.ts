import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { AppComponents, IVoiceDatabaseComponent } from '../types'
import { normalizeAddress } from '../utils/address'

export function createVoiceDBComponent(components: Pick<AppComponents, 'pg'>): IVoiceDatabaseComponent {
  const { pg } = components

  return {
    async areUsersBeingCalledOrCallingSomeone(userAddresses: string[]): Promise<boolean> {
      const normalizedUserAddresses = userAddresses.map(normalizeAddress)

      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM calls WHERE caller_address IN (${normalizedUserAddresses}) OR callee_address IN (${normalizedUserAddresses})
        )
      `
      const results = await pg.query<{ exists: boolean }>(query)
      return results.rows[0].exists
    },
    async createCall(callerAddress: string, calleeAddress: string): Promise<string> {
      const query = SQL`
        INSERT INTO calls (id, caller_address, callee_address)
        VALUES (${randomUUID()}, ${normalizeAddress(callerAddress)}, ${normalizeAddress(calleeAddress)})
        RETURNING id
      `
      const results = await pg.query<{ id: string }>(query)
      return results.rows[0].id
    }
  }
}

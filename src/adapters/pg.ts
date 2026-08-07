import {
  IBaseComponent,
  IConfigComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { createPgComponent as createBasePgComponent, Options } from '@dcl/pg-component'
import { PoolClient } from 'pg'
import { IPgComponent } from '../types'
import { SQLStatement } from 'sql-template-strings'

export async function createPgComponent(
  components: { config: IConfigComponent; logs: ILoggerComponent; metrics?: IMetricsComponent<string> },
  options?: Options
): Promise<IPgComponent & IBaseComponent> {
  const pg = await createBasePgComponent(components, options)

  async function getCount(query: SQLStatement): Promise<number> {
    const result = await pg.query<{ count: number }>(query)
    return Number(result.rows[0].count)
  }

  async function exists<T extends Record<string, any>>(query: SQLStatement, existsProp: keyof T): Promise<boolean> {
    const result = await pg.query<T>(query)
    return result.rows[0]?.[existsProp] ?? false
  }

  async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    onError?: (error: unknown) => Promise<void>
  ): Promise<T> {
    const client = await pg.getPool().connect()

    // Set when the connection cannot be trusted again, so it is destroyed rather than pooled.
    let releaseError: unknown

    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')

      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        // A failed ROLLBACK leaves the connection inside an aborted transaction, so the next
        // borrower would get 25P02 on every statement. Keep the original error as the thrown
        // one: it is the cause, and the rollback failure is a consequence.
        releaseError = rollbackError
      }
      if (onError) await onError(error)
      throw error
    } finally {
      client.release(releaseError as Error | undefined)
    }
  }

  return { ...pg, getCount, exists, withTransaction }
}

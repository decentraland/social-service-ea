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
import { InvalidRequestError } from '@dcl/http-commons'

const INVALID_TEXT_REPRESENTATION = '22P02'

export async function createPgComponent(
  components: { config: IConfigComponent; logs: ILoggerComponent; metrics?: IMetricsComponent<string> },
  options?: Options
): Promise<IPgComponent & IBaseComponent> {
  const pg = await createBasePgComponent(components, options)

  /**
   * Turns Postgres' invalid-text-representation error into a client error.
   *
   * Every value reaching a parameterized query here comes from the request, so 22P02 means the
   * caller sent something malformed — a non-UUID id, most often. Left alone it surfaces as a 500
   * whose body echoes the Postgres message, and with it the caller's own input.
   */
  function translatePgError(error: unknown): unknown {
    if (error && typeof error === 'object' && (error as { code?: string }).code === INVALID_TEXT_REPRESENTATION) {
      return new InvalidRequestError('Invalid identifier')
    }
    return error
  }

  const query: typeof pg.query = async <T extends Record<string, any>>(...args: [any, string?]) => {
    try {
      return await pg.query<T>(...(args as [any]))
    } catch (error) {
      throw translatePgError(error)
    }
  }

  async function getCount(sql: SQLStatement): Promise<number> {
    const result = await query<{ count: number }>(sql)
    return Number(result.rows[0].count)
  }

  async function exists<T extends Record<string, any>>(sql: SQLStatement, existsProp: keyof T): Promise<boolean> {
    const result = await query<T>(sql)
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
      throw translatePgError(error)
    } finally {
      client.release(releaseError as Error | undefined)
    }
  }

  return { ...pg, query, getCount, exists, withTransaction }
}

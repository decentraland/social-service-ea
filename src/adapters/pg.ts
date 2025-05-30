import { IBaseComponent } from '@well-known-components/interfaces'
import { createPgComponent as createBasePgComponent, Options } from '@well-known-components/pg-component'
import { PoolClient } from 'pg'
import { IPgComponent } from '../types'
import { SQLStatement } from 'sql-template-strings'

export async function createPgComponent(
  components: createBasePgComponent.NeededComponents,
  options?: Options
): Promise<IPgComponent & IBaseComponent> {
  const pg = await createBasePgComponent(components, options)

  async function getCount(query: SQLStatement) {
    const result = await pg.query<{ count: number }>(query)
    return Number(result.rows[0].count)
  }

  async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    onError?: (error: unknown) => Promise<void>
  ): Promise<T> {
    const client = await pg.getPool().connect()

    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')

      return result
    } catch (error) {
      await client.query('ROLLBACK')
      if (onError) await onError(error)
      throw error
    } finally {
      // TODO: handle the following eslint-disable statement
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await client.release()
    }
  }

  return { ...pg, getCount, withTransaction }
}

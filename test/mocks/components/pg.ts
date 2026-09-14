import { SQLStatement } from 'sql-template-strings'
import { IPgComponent } from '../../../src/types'
import { PoolClient } from 'pg'

// `query` is typed as a loose jest.Mock so tests can resolve query results without specifying the
// `notices` field that @dcl/pg-component's QueryResult now requires.
export const mockPg: Omit<jest.Mocked<IPgComponent>, 'query'> & { query: jest.Mock } = {
  streamQuery: jest.fn(),
  start: jest.fn(),
  query: jest.fn(),
  getPool: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  }),
  stop: jest.fn(),
  withAsyncContextTransaction: jest.fn(),
  getCount: jest.fn().mockImplementation(async (query: SQLStatement) => {
    const result = await mockPg.query(query)
    return result.rows[0].count
  }),
  exists: jest.fn().mockImplementation(async (query: SQLStatement, existsProp: string) => {
    const result = await mockPg.query(query)
    return result.rows[0]?.[existsProp] ?? false
  }),
  withTransaction: jest.fn().mockImplementation(async (callback: (client: PoolClient) => Promise<any>) => {
    const client = await mockPg.getPool().connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      await client.release()
    }
  })
}

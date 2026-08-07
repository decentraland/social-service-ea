import { IDatabase } from '@well-known-components/interfaces'
import * as BasePgComponent from '@dcl/pg-component'
import { IPgComponent } from '../../../src/types'
import { createPgComponent } from '../../../src/adapters/pg'
import { mockConfig, mockLogs, mockMetrics, mockPg } from '../../mocks/components'
import { SQLStatement } from 'sql-template-strings'
import { InvalidRequestError } from '@dcl/http-commons'

// @dcl/pg-component exposes createPgComponent as a non-configurable getter (it is re-exported via
// `export *`), so it cannot be replaced with jest.spyOn. Mock the module instead.
jest.mock('@dcl/pg-component', () => ({
  ...jest.requireActual('@dcl/pg-component'),
  createPgComponent: jest.fn()
}))

let dbClientQueryMock: jest.Mock
let dbClientReleaseMock: jest.Mock
let dbClientMock: { query: jest.Mock; release: jest.Mock }

let pg: IPgComponent & IDatabase

beforeEach(async () => {
  dbClientQueryMock = jest.fn()
  dbClientReleaseMock = jest.fn().mockResolvedValue(undefined)

  dbClientMock = {
    query: dbClientQueryMock,
    release: dbClientReleaseMock
  }

  // Mock the pool to return our mocked client
  const mockPgWithPool = {
    ...mockPg,
    getPool: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(dbClientMock)
    })
  }

  ;(BasePgComponent.createPgComponent as jest.Mock).mockResolvedValue(mockPgWithPool)

  pg = await createPgComponent({ config: mockConfig, logs: mockLogs, metrics: mockMetrics })
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('when executing db queries inside a transaction', () => {
  beforeEach(() => {
    // Begin Query
    dbClientQueryMock.mockResolvedValueOnce(undefined)
  })

  describe('and the query is successful', () => {
    let transactionPromise: Promise<void>

    beforeEach(async () => {
      transactionPromise = pg.withTransaction(jest.fn())
      await transactionPromise
    })

    it('should execute BEGIN statement to start the transaction', () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith('BEGIN')
    })

    it('should execute the COMMIT statement to finish the successful transaction', () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith('COMMIT')
    })

    it('should release the client', () => {
      expect(dbClientReleaseMock).toHaveBeenCalled()
    })
  })

  describe('and the query is unsuccessful', () => {
    let transactionPromise: Promise<void>

    beforeEach(async () => {
      transactionPromise = pg.withTransaction(() => {
        throw new Error('Unexpected error')
      })
      await expect(transactionPromise).rejects.toEqual(new Error('Unexpected error'))
    })

    it('should execute BEGIN statement to start the transaction', () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith('BEGIN')
    })

    it('should execute the ROLLBACK statement to return to the previous state in the db', () => {
      expect(dbClientQueryMock).not.toHaveBeenCalledWith('COMMIT')
      expect(dbClientQueryMock).toHaveBeenCalledWith('ROLLBACK')
    })

    it('should release the client', () => {
      expect(dbClientReleaseMock).toHaveBeenCalled()
    })
  })
})

describe('when getting count from query', () => {
  const mockQuery = {} as SQLStatement
  const mockCount = 42

  beforeEach(() => {
    mockPg.query.mockResolvedValue({
      rows: [{ count: mockCount }],
      rowCount: 1
    })
  })

  it('should return the count from the query result', async () => {
    const count = await pg.getCount(mockQuery)
    expect(count).toBe(mockCount)
    expect(mockPg.query).toHaveBeenCalledWith(mockQuery)
  })
})

describe('when checking if a record exists in the database', () => {
  const mockQuery = {} as SQLStatement
  const mockExists = true

  beforeEach(() => {
    mockPg.query.mockResolvedValue({
      rows: [{ exists: mockExists }],
      rowCount: 1
    })
  })

  it('should return true if the record exists', async () => {
    const exists = await pg.exists(mockQuery, 'exists')
    expect(exists).toBe(mockExists)
    expect(mockPg.query).toHaveBeenCalledWith(mockQuery)
  })

  describe('and the rollback itself fails', () => {
    let callbackError: Error
    let rollbackError: Error
    let thrown: unknown

    beforeEach(async () => {
      callbackError = new Error('Unexpected error')
      rollbackError = new Error('Connection terminated unexpectedly')
      dbClientQueryMock.mockImplementation(async (statement: unknown) => {
        if (statement === 'ROLLBACK') throw rollbackError
        return undefined
      })

      thrown = await pg
        .withTransaction(() => {
          throw callbackError
        })
        .catch((error) => error)
    })

    it('should throw the original error rather than the rollback failure', () => {
      expect(thrown).toBe(callbackError)
    })

    it('should destroy the connection instead of returning it to the pool', () => {
      expect(dbClientReleaseMock).toHaveBeenCalledWith(rollbackError)
    })
  })

  describe('and the transaction succeeds', () => {
    beforeEach(async () => {
      dbClientQueryMock.mockResolvedValue(undefined)
      await pg.withTransaction(jest.fn())
    })

    it('should return the connection to the pool undamaged', () => {
      expect(dbClientReleaseMock).toHaveBeenCalledWith(undefined)
    })
  })
})

describe('when a query is rejected because a value is not valid for its column type', () => {
  let invalidTextRepresentation: Error & { code: string }
  let thrown: unknown

  beforeEach(async () => {
    invalidTextRepresentation = Object.assign(new Error('invalid input syntax for type uuid: "not-a-uuid"'), {
      code: '22P02'
    })
  })

  describe('and the query runs outside a transaction', () => {
    beforeEach(async () => {
      ;(mockPg.query as jest.Mock).mockRejectedValueOnce(invalidTextRepresentation)
      thrown = await pg.query('SELECT 1').catch((error) => error)
    })

    it('should raise a client error rather than an internal one', () => {
      expect(thrown).toBeInstanceOf(InvalidRequestError)
    })

    it('should not echo the database message back to the caller', () => {
      expect((thrown as Error).message).toBe('Invalid identifier')
    })
  })

  describe('and the query runs inside a transaction', () => {
    beforeEach(async () => {
      dbClientQueryMock.mockImplementation(async (statement: unknown) => {
        if (statement === 'BEGIN' || statement === 'ROLLBACK') return undefined
        throw invalidTextRepresentation
      })
      thrown = await pg.withTransaction((client) => client.query('SELECT 1')).catch((error) => error)
    })

    it('should raise a client error rather than an internal one', () => {
      expect(thrown).toBeInstanceOf(InvalidRequestError)
    })
  })
})

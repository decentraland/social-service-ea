import { IDatabase } from '@well-known-components/interfaces'
import * as BasePgComponent from '@well-known-components/pg-component'
import { IPgComponent } from '../../../src/types'
import { createPgComponent } from '../../../src/adapters/pg'
import { mockConfig, mockLogs, mockMetrics, mockPg } from '../../mocks/components'
import { SQLStatement } from 'sql-template-strings'

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

  jest.spyOn(BasePgComponent, 'createPgComponent').mockImplementation(async () => mockPgWithPool)

  pg = await createPgComponent({ config: mockConfig, logs: mockLogs, metrics: mockMetrics })
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

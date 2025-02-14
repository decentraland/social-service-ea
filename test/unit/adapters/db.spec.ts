import { createDBComponent } from '../../../src/adapters/db'
import { Action } from '../../../src/types'
import SQL from 'sql-template-strings'
import { mockLogs, mockPg } from '../../mocks/components'
import { normalizeAddress } from '../../../src/utils/address'

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid')
}))

describe('db', () => {
  let dbComponent: ReturnType<typeof createDBComponent>

  beforeEach(() => {
    dbComponent = createDBComponent({ pg: mockPg, logs: mockLogs })
  })

  describe('getFriends', () => {
    it('should return active friendships', async () => {
      const mockFriends = [
        { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: true }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockFriends, rowCount: mockFriends.length })

      const userAddress = '0x123'

      const result = await dbComponent.getFriends(userAddress, { onlyActive: true })

      const expectedFragmentsOfTheQuery = [
        {
          text: 'WHEN LOWER(address_requester) =',
          values: ['0x123']
        },
        {
          text: 'WHERE (LOWER(address_requester) =',
          values: ['0x123']
        },
        {
          text: 'OR LOWER(address_requested) =',
          values: ['0x123']
        },
        {
          text: 'AND is_active = true',
          values: []
        },
        {
          text: 'ORDER BY created_at DESC',
          values: []
        },
        {
          text: 'OFFSET',
          values: [expect.any(Number)]
        },
        {
          text: 'LIMIT',
          values: [expect.any(Number)]
        }
      ]

      expectedFragmentsOfTheQuery.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining(text),
            values: expect.arrayContaining(values)
          })
        )
      })

      expect(result).toEqual(mockFriends)
    })

    it('should return all friendships including inactive', async () => {
      const mockFriends = [
        { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: false }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockFriends, rowCount: mockFriends.length })

      const result = await dbComponent.getFriends('0x123', { onlyActive: false })

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.not.objectContaining({
          text: expect.stringContaining('AND is_active = true')
        })
      )
      expect(result).toEqual(mockFriends)
    })
  })

  describe('getFriendsCount', () => {
    it('should return the count of active friendships', async () => {
      const mockCount = 5
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: true })

      const expectedQuery = SQL`WHERE (LOWER(address_requester) = ${'0x123'} OR LOWER(address_requested) = ${'0x123'}) AND is_active = true`

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(expectedQuery.text),
          values: expectedQuery.values
        })
      )
      expect(result).toBe(mockCount)
    })

    it('should return the count of all friendships', async () => {
      const mockCount = 10
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: false })

      const expectedQuery = SQL`WHERE (LOWER(address_requester) = ${'0x123'} OR LOWER(address_requested) = ${'0x123'})`

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(expectedQuery.text),
          values: expectedQuery.values
        })
      )
      expect(result).toBe(mockCount)
    })
  })

  describe('getMutualFriends', () => {
    // TODO improve this test
    it('should return mutual friends', async () => {
      const mockMutualFriends = [{ address: '0x789' }]
      mockPg.query.mockResolvedValueOnce({ rows: mockMutualFriends, rowCount: mockMutualFriends.length })

      const result = await dbComponent.getMutualFriends('0x123', '0x456')

      expect(result).toEqual(mockMutualFriends)
      expect(mockPg.query).toHaveBeenCalled()
    })
  })

  describe('getMutualFriendsCount', () => {
    // TODO improve this test
    it('should return the count of mutual friends', async () => {
      const mockCount = 3
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getMutualFriendsCount('0x123', '0x456')

      expect(result).toBe(mockCount)
      expect(mockPg.query).toHaveBeenCalled()
    })
  })

  describe('getLastFriendshipActionByUsers', () => {
    it('should return the most recent friendship action between two users', async () => {
      const mockAction = {
        id: 'action-1',
        friendship_id: 'friendship-1',
        action: Action.REQUEST,
        acting_user: '0x123',
        metadata: null,
        timestamp: '2025-01-01T00:00:00.000Z'
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockAction], rowCount: 1 })

      const result = await dbComponent.getLastFriendshipActionByUsers('0x123', '0x456')

      expect(result).toEqual(mockAction)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('WHERE (LOWER(f.address_requester), LOWER(f.address_requested)) IN'),
          values: expect.arrayContaining(['0x123', '0x456', '0x456', '0x123'])
        })
      )
    })
  })

  describe('createFriendship', () => {
    it('should create a new friendship', async () => {
      mockPg.query.mockResolvedValueOnce({
        rows: [{ id: 'friendship-1', created_at: '2025-01-01T00:00:00.000Z' }],
        rowCount: 1
      })

      const result = await dbComponent.createFriendship(['0x123', '0x456'], true)

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'INSERT INTO friendships (id, address_requester, address_requested, is_active)'
          ),
          values: expect.arrayContaining([expect.any(String), '0x123', '0x456', true])
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('RETURNING id, created_at')
        })
      )
      expect(result).toEqual({ id: 'friendship-1', created_at: '2025-01-01T00:00:00.000Z' })
    })
  })

  describe('updateFriendshipStatus', () => {
    it('should update friendship status', async () => {
      mockPg.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'friendship-id', created_at: '2025-01-01T00:00:00.000Z' }]
      })

      const result = await dbComponent.updateFriendshipStatus('friendship-id', false)

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`UPDATE friendships SET is_active = ${false}, updated_at = now() WHERE id = ${'friendship-id'} RETURNING id, created_at`
      )
      expect(result).toEqual({
        id: 'friendship-id',
        created_at: '2025-01-01T00:00:00.000Z'
      })
    })
  })

  describe('getFriendship', () => {
    it('should retrieve a specific friendship', async () => {
      const mockFriendship = {
        id: 'friendship-1',
        address_requester: '0x123',
        address_requested: '0x456',
        is_active: true
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockFriendship], rowCount: 1 })

      const result = await dbComponent.getFriendship(['0x123', '0x456'])

      expect(result).toEqual(mockFriendship)
    })
  })

  describe('getLastFriendshipAction', () => {
    it('should return the most recent friendship action', async () => {
      const mockAction = {
        id: 'action-1',
        friendship_id: 'friendship-1',
        action: Action.REQUEST,
        acting_user: '0x123',
        metadata: null,
        timestamp: '2025-01-01T00:00:00.000Z'
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockAction], rowCount: 1 })

      const result = await dbComponent.getLastFriendshipAction('friendship-1')

      expect(result).toEqual(mockAction)
    })
  })

  describe('getReceivedFriendshipRequests', () => {
    it('should retrieve received friendship requests', async () => {
      const mockRequests = [
        {
          id: expect.any(String),
          address: '0x123',
          timestamp: '2025-01-01T00:00:00.000Z',
          metadata: { message: 'Hello' }
        }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: mockRequests.length })

      const result = await dbComponent.getReceivedFriendshipRequests('0x456', { limit: 10, offset: 5 })

      expect(result).toEqual(mockRequests)

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'SELECT fa.id, f.address_requester as address, fa.timestamp, fa.metadata FROM friendships f INNER JOIN friendship_actions fa ON f.id = fa.friendship_id'
          )
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('LOWER(f.address_requested) ='),
          values: expect.arrayContaining(['0x456'])
        })
      )

      expectPaginatedQueryToHaveBeenCalledWithProperLimitAndOffset(10, 5)
    })
  })

  describe('getReceivedFriendshipRequestsCount', () => {
    it('should return the count of received friendship requests', async () => {
      const mockCount = 5
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getReceivedFriendshipRequestsCount('0x456')

      expect(result).toBe(mockCount)
      expect(mockPg.query).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY fa.timestamp DESC')
        })
      )
    })
  })

  describe('getSentFriendshipRequests', () => {
    it('should retrieve sent friendship requests', async () => {
      const mockRequests = [
        {
          id: expect.any(String),
          address: '0x456',
          timestamp: '2025-01-01T00:00:00.000Z',
          metadata: { message: 'Hi there' }
        }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: mockRequests.length })

      const result = await dbComponent.getSentFriendshipRequests('0x123', { limit: 10, offset: 5 })

      expect(result).toEqual(mockRequests)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'SELECT fa.id, f.address_requested as address, fa.timestamp, fa.metadata FROM friendships f INNER JOIN friendship_actions fa ON f.id = fa.friendship_id'
          )
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('LOWER(f.address_requester) ='),
          values: expect.arrayContaining(['0x123'])
        })
      )
      expectPaginatedQueryToHaveBeenCalledWithProperLimitAndOffset(10, 5)
    })
  })

  describe('getSentFriendshipRequestsCount', () => {
    it('should return the count of sent friendship requests', async () => {
      const mockCount = 5
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getSentFriendshipRequestsCount('0x123')

      expect(result).toBe(mockCount)
      expect(mockPg.query).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY fa.timestamp DESC')
        })
      )
    })
  })

  describe('recordFriendshipAction', () => {
    it.each([false, true])('should record a friendship action', async (withTxClient: boolean) => {
      const mockClient = withTxClient ? await mockPg.getPool().connect() : undefined
      const result = await dbComponent.recordFriendshipAction(
        'friendship-id',
        '0x123',
        Action.REQUEST,
        {
          message: 'Hi'
        },
        mockClient
      )

      expect(result).toBe('mock-uuid')
      expect(withTxClient ? mockClient.query : mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'INSERT INTO friendship_actions (id, friendship_id, action, acting_user, metadata)'
          ),
          values: expect.arrayContaining([
            expect.any(String),
            'friendship-id',
            Action.REQUEST,
            '0x123',
            { message: 'Hi' }
          ])
        })
      )
    })
  })

  describe('areFriendsOf', () => {
    it('should return empty array for empty potential friends', async () => {
      const result = await dbComponent.getOnlineFriends('0x123', [])
      expect(result).toEqual([])
      expect(mockPg.query).not.toHaveBeenCalled()
    })

    it('should query friendships for potential friends', async () => {
      const mockResult = {
        rows: [{ address: '0x456' }, { address: '0x789' }],
        rowCount: 2
      }
      const userAddress = '0x123'
      mockPg.query.mockResolvedValueOnce(mockResult)

      const potentialFriends = ['0x456ABC', '0x789DEF', '0x999GHI']
      const normalizedPotentialFriends = potentialFriends.map((address) => normalizeAddress(address))
      await dbComponent.getOnlineFriends('0x123', normalizedPotentialFriends)

      const queryExpectations = [
        SQL`WHEN LOWER(address_requester) = ${userAddress} THEN LOWER(address_requested)`,
        SQL`ELSE LOWER(address_requester)`,
        SQL`(LOWER(address_requester) = ${userAddress} AND LOWER(address_requested) = ANY(${normalizedPotentialFriends}))`,
        SQL`(LOWER(address_requested) = ${userAddress} AND LOWER(address_requester) = ANY(${normalizedPotentialFriends}))`
      ]

      queryExpectations.forEach((query) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining((query as any).strings[0]),
            values: expect.arrayContaining(query.values)
          })
        )
      })
    })
  })

  describe('executeTx', () => {
    it('should execute a transaction successfully', async () => {
      const result = await dbComponent.executeTx(async (client) => {
        await client.query('SELECT 1')
        return 'success'
      })

      const mockClient = await mockPg.getPool().connect()

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(result).toBe('success')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('should rollback the transaction on error', async () => {
      const mockClient = await mockPg.getPool().connect()

      await expect(
        dbComponent.executeTx(async () => {
          throw new Error('Rollback error')
        })
      ).rejects.toThrow('Rollback error')

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalled()
    })
  })

  // Helpers
  function expectPaginatedQueryToHaveBeenCalledWithProperLimitAndOffset(limit: number, offset: number) {
    expect(mockPg.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('LIMIT'),
        values: expect.arrayContaining([limit])
      })
    )

    expect(mockPg.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('OFFSET'),
        values: expect.arrayContaining([offset])
      })
    )
  }
})

import { createDBComponent } from '../../../src/adapters/db'
import { Action } from '../../../src/types'
import SQL from 'sql-template-strings'
import { mockLogs, mockPg } from '../../mocks/components'
import { normalizeAddress } from '../../../src/utils/address'
import { PoolClient } from 'pg'

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid')
}))

describe('db', () => {
  let dbComponent: ReturnType<typeof createDBComponent>

  beforeEach(() => {
    dbComponent = createDBComponent({ pg: mockPg, logs: mockLogs })
  })

  describe('getFriends', () => {
    it('should return active friendships excluding blocked users', async () => {
      const mockFriends = [
        { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: true }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockFriends, rowCount: mockFriends.length })

      const userAddress = '0x123'

      const result = await dbComponent.getFriends(userAddress, { onlyActive: true })

      const expectedFragmentsOfTheQuery = [
        {
          text: 'WHEN LOWER(f.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'WHERE (LOWER(f.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'AND NOT EXISTS (SELECT 1 FROM blocks b WHERE',
          values: []
        },
        {
          text: 'AND b.blocked_address = CASE',
          values: []
        },
        {
          text: 'WHEN LOWER(f.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'ORDER BY f.created_at DESC',
          values: []
        }
      ]

      expectedFragmentsOfTheQuery.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining(text)]),
            values: expect.arrayContaining(values)
          })
        )
      })

      expect(result).toEqual(mockFriends)
    })

    it('should return all friendships including inactive but excluding blocked users', async () => {
      const mockFriends = [
        { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: false }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockFriends, rowCount: mockFriends.length })

      const result = await dbComponent.getFriends('0x123', { onlyActive: false })

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([
            expect.not.stringContaining('AND f.is_active = true'),
            expect.stringContaining('AND NOT EXISTS (SELECT 1 FROM blocks b WHERE')
          ])
        })
      )
      expect(result).toEqual(mockFriends)
    })
  })

  describe('getFriendsCount', () => {
    it('should return the count of active friendships excluding blocked users', async () => {
      const mockCount = 5
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: true })

      const expectedQueryFragments = [
        {
          text: 'SELECT DISTINCT COUNT(*) FROM friendships f',
          values: []
        },
        {
          text: 'WHERE (LOWER(f.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'AND NOT EXISTS (SELECT 1 FROM blocks b WHERE',
          values: []
        }
      ]

      expectedQueryFragments.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining(text)]),
            values: expect.arrayContaining(values)
          })
        )
      })
      expect(result).toBe(mockCount)
    })

    it('should return the count of all friendships excluding blocked users', async () => {
      const mockCount = 10
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: false })

      const expectedQueryFragments = [
        {
          text: 'SELECT DISTINCT COUNT(*) FROM friendships f',
          values: []
        },
        {
          text: 'WHERE (LOWER(f.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'AND NOT EXISTS (SELECT 1 FROM blocks b WHERE',
          values: []
        }
      ]

      expectedQueryFragments.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining(text)]),
            values: expect.arrayContaining(values)
          })
        )
      })
      expect(result).toBe(mockCount)
    })
  })

  describe('getMutualFriends', () => {
    it('should return mutual friends excluding blocked users', async () => {
      const mockMutualFriends = [{ address: '0x789' }]
      mockPg.query.mockResolvedValueOnce({ rows: mockMutualFriends, rowCount: mockMutualFriends.length })

      const result = await dbComponent.getMutualFriends('0x123', '0x456', { limit: 10, offset: 5 })

      expect(result).toEqual(mockMutualFriends)

      const expectedQueryFragments = [
        {
          text: 'WHEN LOWER(f_a.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'AND NOT EXISTS (SELECT 1 FROM blocks b WHERE',
          values: []
        },
        {
          text: 'AND b.blocked_address = CASE',
          values: []
        },
        {
          text: 'ORDER BY f_b.address',
          values: []
        },
        {
          text: 'LIMIT',
          values: [expect.any(Number)]
        },
        {
          text: 'OFFSET',
          values: [expect.any(Number)]
        }
      ]

      expectedQueryFragments.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining(text)]),
            values: expect.arrayContaining(values)
          })
        )
      })
    })

    it('should handle empty results', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const result = await dbComponent.getMutualFriends('0x123', '0x456')

      expect(result).toEqual([])
    })
  })

  describe('getMutualFriendsCount', () => {
    it('should return the count of mutual friends with proper query structure', async () => {
      const mockCount = 3
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getMutualFriendsCount('0x123', '0x456')

      expect(result).toBe(mockCount)

      const expectedQueryFragments = [
        {
          text: 'WITH friendsA as',
          values: []
        },
        {
          text: 'COUNT(address)',
          values: []
        },
        {
          text: 'WHEN LOWER(f_a.address_requester) =',
          values: ['0x123']
        },
        {
          text: 'is_active = true',
          values: []
        }
      ]

      expectedQueryFragments.forEach(({ text, values }) => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining(text),
            values: expect.arrayContaining(values)
          })
        )
      })
    })

    it('should handle zero mutual friends', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })

      const result = await dbComponent.getMutualFriendsCount('0x123', '0x456')

      expect(result).toBe(0)
    })

    it('should normalize addresses in the query', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 })

      await dbComponent.getMutualFriendsCount('0x123ABC', '0x456DEF')

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining(['0x123abc', '0x456def'])
        })
      )
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
    it.each([false, true])('should create a new friendship using txs: %s', async (withTxClient: boolean) => {
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rows: [{ id: 'friendship-1', created_at: '2025-01-01T00:00:00.000Z' }],
        rowCount: 1
      })

      const result = await dbComponent.createFriendship(['0x123', '0x456'], true, mockClient)

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'INSERT INTO friendships (id, address_requester, address_requested, is_active)'
          ),
          values: expect.arrayContaining([expect.any(String), '0x123', '0x456', true])
        })
      )
      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('RETURNING id, created_at')
        })
      )
      expect(result).toEqual({ id: 'friendship-1', created_at: '2025-01-01T00:00:00.000Z' })
    })
  })

  describe('updateFriendshipStatus', () => {
    it.each([false, true])('should update friendship status using txs: %s', async (withTxClient: boolean) => {
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rowCount: 1,
        rows: [{ id: 'friendship-id', created_at: '2025-01-01T00:00:00.000Z' }]
      })

      const result = await dbComponent.updateFriendshipStatus('friendship-id', false, mockClient)

      expect(queryToAssert).toHaveBeenCalledWith(
        SQL`UPDATE friendships SET is_active = ${false}, updated_at = now() WHERE id = ${'friendship-id'} RETURNING id, created_at`
      )
      expect(result).toEqual({
        id: 'friendship-id',
        created_at: '2025-01-01T00:00:00.000Z'
      })
    })
  })

  describe('getFriendship', () => {
    it.each([true])('should retrieve a specific friendship using txs: %s', async (withTxClient: boolean) => {
      const mockFriendship = {
        id: 'friendship-1',
        address_requester: '0x123',
        address_requested: '0x456',
        is_active: true
      }
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rows: [mockFriendship],
        rowCount: 1
      })

      const result = await dbComponent.getFriendship(['0x123', '0x456'], mockClient)

      expect(result).toEqual(mockFriendship)

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'SELECT * FROM friendships WHERE (LOWER(address_requester), LOWER(address_requested)) IN'
          ),
          values: expect.arrayContaining(['0x123', '0x456', '0x456', '0x123'])
        })
      )
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
            'SELECT fa.id, fa.acting_user as address, fa.timestamp, fa.metadata FROM friendship_actions fa'
          )
        })
      )

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('JOIN friendships f ON f.id = fa.friendship_id AND f.is_active IS FALSE')
        })
      )

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('fa.action = '),
          values: expect.arrayContaining([Action.REQUEST])
        })
      )

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(`NOT EXISTS`)
        })
      )

      const normalizedUserAddress = normalizeAddress('0x456')
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('fa.acting_user <>'),
          values: expect.arrayContaining([normalizedUserAddress])
        })
      )

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('f.address_requester ='),
          values: expect.arrayContaining([normalizedUserAddress])
        })
      )

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('f.address_requested ='),
          values: expect.arrayContaining([normalizedUserAddress])
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
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('COUNT(1) as count')
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
          text: expect.stringContaining(`WHEN f.address_requester = fa.acting_user THEN f.address_requested`)
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(`ELSE f.address_requester`)
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('JOIN friendships f ON f.id = fa.friendship_id AND f.is_active IS FALSE')
        })
      )
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('fa.acting_user ='),
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
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('COUNT(1) as count')
        })
      )
    })
  })

  describe('recordFriendshipAction', () => {
    it.each([false, true])('should record a friendship action using txs: %s', async (withTxClient: boolean) => {
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rows: [{ id: 'mock-uuid' }],
        rowCount: 1
      })

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
      expect(queryToAssert).toHaveBeenCalledWith(
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
        SQL`(LOWER(address_requested) = ${userAddress} AND LOWER(address_requester) = ANY(${normalizedPotentialFriends}))`,
        SQL`AND NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (LOWER(blocker_address) = ${userAddress} AND LOWER(blocked_address) = ANY(${normalizedPotentialFriends}))
          OR
          (LOWER(blocker_address) = ANY(${normalizedPotentialFriends}) AND LOWER(blocked_address) = ${userAddress})
        )`
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

  describe('blockUser', () => {
    it.each([false, true])('should block a user using txs: %s', async (withTxClient: boolean) => {
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rows: [{ id: 'block-id', blocked_at: new Date() }],
        rowCount: 1
      })

      await dbComponent.blockUser('0x123', '0x456', mockClient)

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO blocks (id, blocker_address, blocked_address)'),
          values: expect.arrayContaining([expect.any(String), normalizeAddress('0x123'), normalizeAddress('0x456')])
        })
      )

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'ON CONFLICT (blocker_address, blocked_address) DO UPDATE SET id = blocks.id, blocked_at = blocks.blocked_at'
          )
        })
      )

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('RETURNING id, blocked_at')
        })
      )
    })
  })

  describe('unblockUser', () => {
    it.each([false, true])('should unblock a user using txs: %s', async (withTxClient: boolean) => {
      const { query: queryToAssert, mockClient } = await mockQuery(withTxClient, {
        rows: [{ id: 'block-id', blocked_at: new Date() }],
        rowCount: 1
      })

      await dbComponent.unblockUser('0x123', '0x456', mockClient)
      const expectedQuery = SQL`
        DELETE FROM blocks
        WHERE LOWER(blocker_address) = ${normalizeAddress('0x123')}
          AND LOWER(blocked_address) = ${normalizeAddress('0x456')}`

      expect(queryToAssert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(expectedQuery.text),
          values: expectedQuery.values
        })
      )
    })
  })

  describe('blockUsers', () => {
    it('should block multiple users', async () => {
      await dbComponent.blockUsers('0x123', ['0x456', '0x789'])
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO blocks (id, blocker_address, blocked_address)'),
          values: expect.arrayContaining([
            expect.any(String),
            normalizeAddress('0x123'),
            normalizeAddress('0x456'),
            expect.any(String),
            normalizeAddress('0x123'),
            normalizeAddress('0x789')
          ])
        })
      )
    })
  })

  describe('unblockUsers', () => {
    it('should unblock multiple users', async () => {
      await dbComponent.unblockUsers('0x123', ['0x456', '0x789'])
      const expectedQuery = SQL`
        DELETE FROM blocks
        WHERE LOWER(blocker_address) = ${normalizeAddress('0x123')}
          AND LOWER(blocked_address) = ANY(${['0x456', '0x789'].map(normalizeAddress)})`

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(expectedQuery.text),
          values: expectedQuery.values
        })
      )
    })
  })

  describe('getBlockedUsers', () => {
    it('should retrieve blocked users', async () => {
      const mockBlockedUsers = [
        { address: '0x456', blocked_at: new Date() },
        { address: '0x789', blocked_at: new Date() }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockBlockedUsers, rowCount: mockBlockedUsers.length })

      const result = await dbComponent.getBlockedUsers('0x123')
      expect(result).toEqual(mockBlockedUsers)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('LOWER(blocker_address) ='),
          values: expect.arrayContaining([normalizeAddress('0x123')])
        })
      )
    })
  })

  describe('getBlockedByUsers', () => {
    it('should retrieve blocked by users', async () => {
      const mockBlockedByUsers = [
        { address: '0x456', blocked_at: new Date() },
        { address: '0x789', blocked_at: new Date() }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockBlockedByUsers, rowCount: mockBlockedByUsers.length })

      const result = await dbComponent.getBlockedByUsers('0x123')
      expect(result).toEqual(mockBlockedByUsers)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'SELECT blocker_address as address, blocked_at FROM blocks WHERE LOWER(blocked_address) ='
          ),
          values: expect.arrayContaining([normalizeAddress('0x123')])
        })
      )
    })
  })

  describe('isFriendshipBlocked', () => {
    it('should check if exists a blocked friendship', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
      await dbComponent.isFriendshipBlocked('0x123', '0x456')

      const expectedQuery = SQL`
        SELECT EXISTS (
          SELECT 1 FROM blocks
          WHERE (LOWER(blocker_address), LOWER(blocked_address)) IN ((${'0x123'}, ${'0x456'}), (${'0x456'}, ${'0x123'}))
        )
      `

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(expectedQuery.text),
          values: expectedQuery.values
        })
      )
    })

    it.each([false, true])('should return %s if the friendship is %s', async (isBlocked: boolean) => {
      mockPg.query.mockResolvedValueOnce({ rows: [{ exists: isBlocked }], rowCount: 1 })
      const result = await dbComponent.isFriendshipBlocked('0x123', '0x456')
      expect(result).toBe(isBlocked)
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

  async function mockQuery(withTxClient: boolean, result?: any) {
    if (withTxClient) {
      const mockClient = await mockPg.getPool().connect()
      mockClient.query = jest.fn().mockResolvedValueOnce(result)
      return { mockClient, query: mockClient.query }
    } else {
      mockPg.query.mockResolvedValueOnce(result)
      return { query: mockPg.query }
    }
  }
})

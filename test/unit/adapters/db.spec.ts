import { createDBComponent } from '../../../src/adapters/db'
import { Action } from '../../../src/types'
import SQL from 'sql-template-strings'
import { mockLogs, mockPg } from '../../mocks/components'

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

      const result = await dbComponent.getFriends('0x123', { onlyActive: true })

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`SELECT * FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'}) AND is_active = true ORDER BY created_at DESC OFFSET ${expect.any(Number)} LIMIT ${expect.any(Number)}`
      )
      expect(result).toEqual(mockFriends)
    })

    it('should return all friendships including inactive', async () => {
      const mockFriends = [
        { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: false }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockFriends, rowCount: mockFriends.length })

      const result = await dbComponent.getFriends('0x123', { onlyActive: false })

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`SELECT * FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'}) ORDER BY created_at DESC OFFSET ${expect.any(Number)} LIMIT ${expect.any(Number)}`
      )
      expect(result).toEqual(mockFriends)
    })
  })

  describe('getFriendsCount', () => {
    it('should return the count of active friendships', async () => {
      const mockCount = 5
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: true })

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`SELECT COUNT(*) FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'}) AND is_active = true`
      )
      expect(result).toBe(mockCount)
    })

    it('should return the count of all friendships', async () => {
      const mockCount = 10
      mockPg.query.mockResolvedValueOnce({ rows: [{ count: mockCount }], rowCount: 1 })

      const result = await dbComponent.getFriendsCount('0x123', { onlyActive: false })

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`SELECT COUNT(*) FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'})`
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
      mockPg.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ updated_at: '2025-01-01T00:00:00.000Z' }] })

      const result = await dbComponent.updateFriendshipStatus('friendship-id', false)

      expect(result).toBe(true)
      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`UPDATE friendships SET is_active = ${false}, updated_at = now() WHERE id = ${'friendship-id'}`
      )
    })

    it('should return false if no rows were updated', async () => {
      mockPg.query.mockResolvedValueOnce({ rowCount: 0, rows: [] })

      const result = await dbComponent.updateFriendshipStatus('friendship-id', false)

      expect(result).toBe(false)
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
          address: '0x123',
          timestamp: '2025-01-01T00:00:00.000Z',
          metadata: { message: 'Hello' }
        }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: mockRequests.length })

      const result = await dbComponent.getReceivedFriendshipRequests('0x456')

      expect(result).toEqual(mockRequests)
    })
  })

  describe('getSentFriendshipRequests', () => {
    it('should retrieve sent friendship requests', async () => {
      const mockRequests = [
        {
          address: '0x456',
          timestamp: '2025-01-01T00:00:00.000Z',
          metadata: { message: 'Hi there' }
        }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: mockRequests.length })

      const result = await dbComponent.getSentFriendshipRequests('0x123')

      expect(result).toEqual(mockRequests)
    })
  })

  describe('recordFriendshipAction', () => {
    it('should record a friendship action', async () => {
      const result = await dbComponent.recordFriendshipAction('friendship-id', '0x123', Action.REQUEST, {
        message: 'Hi'
      })

      expect(result).toBe(true)
      expect(mockPg.query).toHaveBeenCalledWith(
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
    })
  })
})

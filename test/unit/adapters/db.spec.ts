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
    it('should stream active friendships', async () => {
      const mockGenerator = (async function* () {
        yield { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: true }
      })()
      mockPg.streamQuery.mockReturnValueOnce(mockGenerator)

      const generator = dbComponent.getFriends('0x123', true)
      const result = await generator.next()

      expect(mockPg.streamQuery).toHaveBeenCalledWith(
        SQL`SELECT * FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'}) AND is_active = true`
      )
      expect(result.value).toEqual({
        id: 'friendship-1',
        address_requester: '0x123',
        address_requested: '0x456',
        is_active: true
      })
    })

    it('should stream all friendships (including inactive)', async () => {
      const mockGenerator = (async function* () {
        yield { id: 'friendship-1', address_requester: '0x123', address_requested: '0x456', is_active: false }
      })()
      mockPg.streamQuery.mockReturnValueOnce(mockGenerator)

      const generator = dbComponent.getFriends('0x123', false)
      const result = await generator.next()

      expect(mockPg.streamQuery).toHaveBeenCalledWith(
        SQL`SELECT * FROM friendships WHERE (address_requester = ${'0x123'} OR address_requested = ${'0x123'})`
      )
      expect(result.value).toEqual({
        id: 'friendship-1',
        address_requester: '0x123',
        address_requested: '0x456',
        is_active: false
      })
    })
  })

  describe('getMutualFriends', () => {
    it('should stream mutual friends', async () => {
      const mockGenerator = (async function* () {
        yield { address: '0x789' }
      })()
      mockPg.streamQuery.mockReturnValueOnce(mockGenerator)

      const generator = dbComponent.getMutualFriends('0x123', '0x456')
      const result = await generator.next()

      expect(result.value).toEqual({ address: '0x789' })
      expect(mockPg.streamQuery).toHaveBeenCalled()
    })
  })

  describe('createFriendship', () => {
    it('should create a new friendship', async () => {
      await dbComponent.createFriendship(['0x123', '0x456'], true)

      expect(mockPg.query).toHaveBeenCalledWith(
        SQL`INSERT INTO friendships (id, address_requester, address_requested, is_active) VALUES (${expect.any(String)}, ${'0x123'}, ${'0x456'}, ${true})`
      )
    })
  })

  describe('updateFriendshipStatus', () => {
    it('should update friendship status', async () => {
      mockPg.query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] })

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
      expect(mockPg.query).toHaveBeenCalled()
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
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: 1 })

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
      mockPg.query.mockResolvedValueOnce({ rows: mockRequests, rowCount: 1 })

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
          values: expect.arrayContaining(['friendship-id', '0x123', Action.REQUEST, { message: 'Hi' }])
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

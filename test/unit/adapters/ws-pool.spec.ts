import { createWSPoolComponent } from '../../../src/adapters/ws-pool'
import { mockConfig, mockMetrics, mockRedis } from '../../mocks/components'
import { IWSPoolComponent } from '../../../src/types'

describe('ws-pool-component', () => {
  let wsPool: IWSPoolComponent
  let mockRedisClient: jest.Mocked<any>

  beforeEach(async () => {
    jest.clearAllMocks()

    mockRedisClient = mockRedis.client as jest.Mocked<any>
    mockRedisClient.zCard.mockResolvedValue(0)
    mockRedisClient.exists.mockResolvedValue(0)
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.zAdd.mockResolvedValue(1)
    mockRedisClient.multi.mockReturnValue({
      zCard: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([0, 'OK', 1])
    })

    mockConfig.getNumber.mockImplementation(async (key) => {
      if (key === 'MAX_CONCURRENT_CONNECTIONS') return 100
      if (key === 'IDLE_TIMEOUT') return 300000
      return 0
    })

    wsPool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig, redis: mockRedis })
  })

  describe('initialization', () => {
    it('should initialize with default max connections if config returns falsy', async () => {
      mockConfig.getNumber.mockResolvedValueOnce(0)
      const pool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig, redis: mockRedis })
      expect(pool).toBeDefined()
    })

    it('should use configured max connections', async () => {
      mockConfig.getNumber.mockImplementation(async (key) => (key === 'MAX_CONCURRENT_CONNECTIONS' ? 1 : 300000))
      const pool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig, redis: mockRedis })

      mockRedisClient.multi.mockReturnValue({
        zCard: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([0, 'OK', 1])
      })

      await pool.acquireConnection('conn-1')

      mockRedisClient.multi.mockReturnValue({
        zCard: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([1, 'OK', 1])
      })

      await expect(pool.acquireConnection('conn-2')).rejects.toThrow('Maximum connections reached')
    })
  })

  describe('acquireConnection', () => {
    it('should acquire connection when below limit', async () => {
      await wsPool.acquireConnection('test-1')
      expect(mockRedisClient.multi).toHaveBeenCalled()
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 1)
    })

    it('should fail if connection already exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1)
      await expect(wsPool.acquireConnection('test-1')).rejects.toThrow('Connection already exists')
    })

    it('should handle Redis transaction failure', async () => {
      mockRedisClient.multi.mockReturnValue({
        zCard: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      })

      await expect(wsPool.acquireConnection('test-1')).rejects.toThrow('Transaction failed')
    })
  })

  describe('releaseConnection', () => {
    it('should release existing connection', async () => {
      await wsPool.releaseConnection('test-1')
      expect(mockRedisClient.del).toHaveBeenCalledWith('ws:conn:test-1')
      expect(mockRedisClient.zRem).toHaveBeenCalledWith('ws:active_connections', 'test-1')
    })

    it('should update metrics after release', async () => {
      mockRedisClient.zCard.mockResolvedValue(0)
      await wsPool.releaseConnection('test-1')
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 0)
    })
  })

  describe('updateActivity', () => {
    it('should update connection activity', async () => {
      await wsPool.updateActivity('test-1')
      expect(mockRedisClient.set).toHaveBeenCalled()
    })
  })

  describe('isConnectionAvailable', () => {
    it('should check if connection exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1)
      expect(await wsPool.isConnectionAvailable('test-1')).toBe(true)

      mockRedisClient.exists.mockResolvedValue(0)
      expect(await wsPool.isConnectionAvailable('test-1')).toBe(false)
    })
  })

  describe('getActiveConnections', () => {
    it('should return number of active connections', async () => {
      mockRedisClient.zCard.mockResolvedValue(5)
      expect(await wsPool.getActiveConnections()).toBe(5)
    })
  })

  describe('cleanup', () => {
    it('should cleanup all connections', async () => {
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()

      mockRedisClient.scanIterator.mockReturnValue(mockIterator as any)

      await wsPool.cleanup()
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2)
      expect(mockRedisClient.zRem).toHaveBeenCalledTimes(2)
    })
  })
})

import { createWSPoolComponent } from '../../../src/adapters/ws-pool'
import { mockConfig, mockMetrics, mockRedis, mockLogs } from '../../mocks/components'
import { IWSPoolComponent } from '../../../src/types'

describe('ws-pool-component', () => {
  let wsPool: IWSPoolComponent
  let mockRedisClient: jest.Mocked<any>
  let originalSetInterval: typeof setInterval
  let mockSetInterval: jest.Mock
  let mockClearInterval: jest.Mock

  beforeEach(async () => {
    // Mock setInterval/clearInterval
    originalSetInterval = global.setInterval
    mockSetInterval = jest.fn()
    mockClearInterval = jest.fn()
    global.setInterval = mockSetInterval as any
    global.clearInterval = mockClearInterval

    mockRedisClient = mockRedis.client as jest.Mocked<any>
    mockRedisClient.zCard.mockResolvedValue(0)
    mockRedisClient.exists.mockResolvedValue(0)
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.zAdd.mockResolvedValue(1)
    mockRedisClient.multi.mockReturnValue({
      set: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(['OK', 1])
    })

    // Mock redis.get and redis.put for the component
    mockRedis.get.mockResolvedValue(null)
    mockRedis.put.mockResolvedValue(undefined)

    mockConfig.getNumber.mockImplementation(async (key) => {
      if (key === 'IDLE_TIMEOUT_IN_MS') return 300000
      return 0
    })

    wsPool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig, redis: mockRedis, logs: mockLogs })
  })

  afterEach(() => {
    global.setInterval = originalSetInterval
  })

  describe('initialization', () => {
    it('should initialize with default idle timeout if config returns falsy', async () => {
      mockConfig.getNumber.mockResolvedValueOnce(0)
      const pool = await createWSPoolComponent({
        metrics: mockMetrics,
        config: mockConfig,
        redis: mockRedis,
        logs: mockLogs
      })
      expect(pool).toBeDefined()
    })

    it('should use configured idle timeout', async () => {
      const customTimeout = 60000
      mockConfig.getNumber.mockImplementation(async (key) => (key === 'IDLE_TIMEOUT_IN_MS' ? customTimeout : 0))
      const pool = await createWSPoolComponent({
        metrics: mockMetrics,
        config: mockConfig,
        redis: mockRedis,
        logs: mockLogs
      })
      expect(pool).toBeDefined()
    })

    it('should set up cleanup interval', async () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000)
    })

    it('should handle idle timeout cleanup', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)

      mockRedis.get
        .mockResolvedValueOnce({ lastActivity: Date.now() - 400000 }) // Expired
        .mockResolvedValueOnce({ lastActivity: Date.now() - 100000 }) // Not expired

      await cleanupFn()

      expect(mockRedisClient.del).toHaveBeenCalledWith('ws:conn:test-1')
      expect(mockRedisClient.zRem).toHaveBeenCalledWith('ws:active_connections', 'test-1')
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_idle_timeouts')

      expect(mockRedisClient.del).not.toHaveBeenCalledWith('ws:conn:test-2')
      expect(mockRedisClient.zRem).not.toHaveBeenCalledWith('ws:active_connections', 'test-2')
    })

    it('should handle null data in cleanup', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]

      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)
      mockRedisClient.get.mockResolvedValueOnce(null)

      await cleanupFn()

      expect(mockRedisClient.del).not.toHaveBeenCalled()
      expect(mockRedisClient.zRem).not.toHaveBeenCalled()
      expect(mockMetrics.increment).not.toHaveBeenCalled()
    })

    it('should handle invalid JSON in cleanup', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]

      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)
      mockRedisClient.get.mockResolvedValueOnce('invalid json')

      await cleanupFn()

      expect(mockRedisClient.del).not.toHaveBeenCalled()
      expect(mockRedisClient.zRem).not.toHaveBeenCalled()
      expect(mockMetrics.increment).not.toHaveBeenCalled()
    })
  })

  describe('acquireConnection', () => {
    it('should acquire connection and update metrics', async () => {
      mockRedisClient.zCard.mockResolvedValue(1)

      mockRedisClient.multi.mockReturnValueOnce({
        zCard: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 1])
      })

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

    it('should set connection data in Redis with correct parameters', async () => {
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now)

      mockRedisClient.multi.mockReturnValue({
        zCard: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 1])
      })

      await wsPool.acquireConnection('test-1')

      const multiSetCall = mockRedisClient.multi().set.mock.calls[0]
      expect(multiSetCall[0]).toBe('ws:conn:test-1')
      expect(multiSetCall[1]).toBe(JSON.stringify({ lastActivity: now, startTime: now }))
      expect(multiSetCall[2]).toEqual({
        NX: true,
        EX: Math.ceil(300000 / 1000)
      })

      jest.restoreAllMocks()
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
      const key = 'ws:conn:test-1'
      await wsPool.updateActivity('test-1')

      expect(mockRedis.put).toHaveBeenCalledWith(
        key,
        { lastActivity: expect.any(Number) },
        {
          XX: true,
          EX: Math.ceil(300000 / 1000)
        }
      )
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
    it('should cleanup all connections and clear interval', async () => {
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator as any)

      await wsPool.cleanup()

      expect(mockRedisClient.del).toHaveBeenCalledTimes(2)
      expect(mockRedisClient.zRem).toHaveBeenCalledTimes(2)
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })
})

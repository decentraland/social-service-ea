import { createWSPoolComponent } from '../../../src/adapters/ws-pool'
import { mockConfig, mockMetrics, mockRedis, mockLogs } from '../../mocks/components'
import { IWSPoolComponent } from '../../../src/types'
import { exec } from 'child_process'

describe('ws-pool-component', () => {
  let wsPool: IWSPoolComponent
  let mockRedisClient: jest.Mocked<any>
  let originalSetInterval: typeof setInterval
  let mockSetInterval: jest.Mock
  let mockClearInterval: jest.Mock

  beforeEach(async () => {
    originalSetInterval = global.setInterval

    mockSetInterval = jest.fn()
    mockClearInterval = jest.fn()

    global.setInterval = mockSetInterval as any
    global.clearInterval = mockClearInterval

    mockRedisClient = mockRedis.client as jest.Mocked<any>
    mockRedisClient.sCard.mockResolvedValue(0)
    mockRedisClient.exists.mockResolvedValue(0)
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.sAdd.mockResolvedValue(1)

    const mockMulti = {
      set: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      sRem: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(['OK', 1])
    }
    mockRedisClient.multi.mockReturnValue(mockMulti)

    mockRedis.get.mockResolvedValue(null)
    mockRedis.put.mockResolvedValue(undefined)

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

    it('should set up cleanup interval of one minute', async () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000)
    })

    it('should handle idle timeout cleanup and update metrics when connections are cleaned', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)

      mockRedis.get
        .mockResolvedValueOnce({ lastActivity: Date.now() - 400000 })
        .mockResolvedValueOnce({ lastActivity: Date.now() - 100000 })

      // Mock getActiveConnections to return 1 after cleanup (since one connection was cleaned)
      mockRedisClient.sCard.mockResolvedValueOnce(1)

      await cleanupFn()

      expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
      expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_idle_timeouts')

      expect(mockRedisClient.multi().del).not.toHaveBeenCalledWith('ws:conn:test-2')
      expect(mockRedisClient.multi().sRem).not.toHaveBeenCalledWith('ws:conn_ids', 'test-2')

      // Should update metrics after cleanup since connections were cleaned
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 1)
    })

    it('should not update metrics when no connections are cleaned up', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]

      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)
      mockRedis.get.mockResolvedValueOnce({ lastActivity: Date.now() - 100000 }) // Not idle

      await cleanupFn()

      expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
      expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
      expect(mockMetrics.increment).not.toHaveBeenCalled()
      expect(mockMetrics.observe).not.toHaveBeenCalledWith(
        'ws_active_connections',
        { type: 'total' },
        expect.any(Number)
      )
    })

    it('should handle null data in cleanup', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]

      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)
      mockRedisClient.get.mockResolvedValueOnce(null)

      await cleanupFn()

      expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
      expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
      expect(mockMetrics.increment).not.toHaveBeenCalled()
      expect(mockMetrics.observe).not.toHaveBeenCalledWith(
        'ws_active_connections',
        { type: 'total' },
        expect.any(Number)
      )
    })

    it('should handle invalid JSON in cleanup', async () => {
      const cleanupFn = mockSetInterval.mock.calls[0][0]

      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator)
      mockRedisClient.get.mockResolvedValueOnce('invalid json')

      await cleanupFn()

      expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
      expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
      expect(mockMetrics.increment).not.toHaveBeenCalled()
      expect(mockMetrics.observe).not.toHaveBeenCalledWith(
        'ws_active_connections',
        { type: 'total' },
        expect.any(Number)
      )
    })
  })

  describe('acquireConnection', () => {
    const testId = 'test-connection-1'
    const expectedKey = `ws:conn:${testId}`
    const now = Date.now()
    const expectedData = { lastActivity: now, startTime: now }

    jest.spyOn(Date, 'now').mockReturnValue(now)

    it('should acquire new connection with correct Redis operations and update metrics', async () => {
      // Mock getActiveConnections to return 1 after acquisition
      mockRedisClient.sCard.mockResolvedValueOnce(1)

      await wsPool.acquireConnection(testId)

      expect(mockRedisClient.multi).toHaveBeenCalled()
      const multiChain = mockRedisClient.multi()

      expect(multiChain.set).toHaveBeenCalledWith(expectedKey, JSON.stringify(expectedData), {
        NX: true,
        EX: Math.ceil(300000 / 1000)
      })
      expect(multiChain.sAdd).toHaveBeenCalledWith('ws:conn_ids', testId)
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 1)
    })

    it('should handle transaction failure', async () => {
      const mockFailedMulti = {
        set: jest.fn().mockReturnThis(),
        sAdd: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        sRem: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      }

      mockRedisClient.multi.mockReturnValueOnce(mockFailedMulti)

      await expect(wsPool.acquireConnection(testId)).rejects.toThrow('Connection already exists')

      expect(mockRedisClient.multi().del).toHaveBeenCalledWith(expectedKey)
      expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', testId)
    })
  })

  describe('releaseConnection', () => {
    it('should release existing connection and update metrics immediately', async () => {
      // Mock getActiveConnections to return 0 after release
      mockRedisClient.sCard.mockResolvedValueOnce(0)

      await wsPool.releaseConnection('test-1')
      expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
      expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
      // Should update ws_active_connections metric immediately after release
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 0)
    })

    it('should track connection duration metrics after release', async () => {
      const now = Date.now()
      mockRedis.get.mockResolvedValueOnce({ startTime: now - 10000, lastActivity: now - 5000 })
      mockRedisClient.sCard.mockResolvedValueOnce(0)

      await wsPool.releaseConnection('test-1')

      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_connection_duration_seconds', {}, expect.any(Number))
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
      mockRedisClient.sCard.mockResolvedValue(5)
      expect(await wsPool.getActiveConnections()).toBe(5)
    })
  })

  describe('cleanup', () => {
    it('should cleanup all connections, clear interval, and update metrics', async () => {
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()
      mockRedisClient.scanIterator.mockReturnValue(mockIterator as any)

      // Mock getActiveConnections to return 0 after cleanup
      mockRedisClient.sCard.mockResolvedValueOnce(0)

      await wsPool.cleanup()

      expect(mockRedisClient.multi().del).toHaveBeenCalledTimes(2)
      expect(mockRedisClient.multi().sRem).toHaveBeenCalledTimes(2)
      expect(mockClearInterval).toHaveBeenCalled()
      // Should update metrics after cleanup (initial state reporting)
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 0)
    })
  })
})

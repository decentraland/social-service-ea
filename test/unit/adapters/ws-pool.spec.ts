import { createWSPoolComponent } from '../../../src/adapters/ws-pool'
import { mockConfig, mockMetrics, mockRedis, mockLogs } from '../../mocks/components'
import { IWSPoolComponent } from '../../../src/types'

describe('ws-pool-component', () => {
  let wsPool: IWSPoolComponent
  let mockRedisClient: jest.Mocked<any>
  let originalSetInterval: typeof setInterval
  let mockSetInterval: jest.Mock
  let mockClearInterval: jest.Mock

  const testId = 'test-connection-1'
  const expectedKey = `ws:conn:${testId}`
  const now = Date.now()
  const expectedData = { lastActivity: now, startTime: now }

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

    jest.spyOn(Date, 'now').mockReturnValue(now)

    wsPool = await createWSPoolComponent({
      metrics: mockMetrics,
      config: mockConfig,
      redis: mockRedis,
      logs: mockLogs
    })
  })

  afterEach(() => {
    global.setInterval = originalSetInterval
    jest.restoreAllMocks()
  })

  describe('when initializing the component', () => {
    describe('and config returns falsy value', () => {
      beforeEach(() => {
        mockConfig.getNumber.mockResolvedValueOnce(0)
      })

      it('should initialize with default idle timeout', async () => {
        const pool = await createWSPoolComponent({
          metrics: mockMetrics,
          config: mockConfig,
          redis: mockRedis,
          logs: mockLogs
        })

        expect(pool).toBeDefined()
      })
    })

    describe('and config returns a valid timeout', () => {
      const customTimeout = 600000 // 10 minutes

      beforeEach(() => {
        mockConfig.getNumber.mockResolvedValueOnce(customTimeout)
      })

      it('should use the configured timeout', async () => {
        await createWSPoolComponent({
          metrics: mockMetrics,
          config: mockConfig,
          redis: mockRedis,
          logs: mockLogs
        })

        expect(mockConfig.getNumber).toHaveBeenCalledWith('IDLE_TIMEOUT_IN_MS')
      })
    })

    it('should set up cleanup interval of one minute', () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000)
    })
  })

  describe('when cleaning up idle connections', () => {
    let cleanupFn: Function

    beforeEach(() => {
      cleanupFn = mockSetInterval.mock.calls[0][0]
    })

    describe('and there are idle connections', () => {
      const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()

      beforeEach(() => {
        mockRedisClient.scanIterator.mockReturnValue(mockIterator)
        mockRedis.get
          .mockResolvedValueOnce({ lastActivity: Date.now() - 400000 }) // 6.6 minutes ago
          .mockResolvedValueOnce({ lastActivity: Date.now() - 100000 }) // 1.6 minutes ago
      })

      it('should remove only the idle connections and update metrics', async () => {
        await cleanupFn()

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_idle_timeouts')

        expect(mockRedisClient.multi().del).not.toHaveBeenCalledWith('ws:conn:test-2')
        expect(mockRedisClient.multi().sRem).not.toHaveBeenCalledWith('ws:conn_ids', 'test-2')
      })
    })

    describe('and there are no idle connections', () => {
      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()

      beforeEach(() => {
        mockRedisClient.scanIterator.mockReturnValue(mockIterator)
        mockRedis.get.mockResolvedValueOnce({ lastActivity: Date.now() - 100000 }) // 1.6 minutes ago
      })

      it('should not remove any connections', async () => {
        await cleanupFn()

        expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
        expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
        expect(mockMetrics.increment).not.toHaveBeenCalled()
      })
    })

    describe('and connection data is null', () => {
      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()

      beforeEach(() => {
        mockRedisClient.scanIterator.mockReturnValue(mockIterator)
        mockRedis.get.mockResolvedValueOnce(null)
      })

      it('should not remove any connections', async () => {
        await cleanupFn()

        expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
        expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
        expect(mockMetrics.increment).not.toHaveBeenCalled()
      })
    })

    describe('and connection data is invalid', () => {
      const mockIterator = ['ws:conn:test-1'][Symbol.iterator]()

      beforeEach(() => {
        mockRedisClient.scanIterator.mockReturnValue(mockIterator)
        mockRedis.get.mockResolvedValueOnce('invalid json')
      })

      it('should not remove any connections', async () => {
        await cleanupFn()

        expect(mockRedisClient.multi().del).not.toHaveBeenCalled()
        expect(mockRedisClient.multi().sRem).not.toHaveBeenCalled()
        expect(mockMetrics.increment).not.toHaveBeenCalled()
      })
    })
  })

  describe('when acquiring a connection', () => {
    describe('and the transaction succeeds', () => {
      beforeEach(() => {
        const mockMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(['OK', 1])
        }
        mockRedisClient.multi.mockReturnValue(mockMulti)
      })

      it('should create the connection with correct Redis operations', async () => {
        await wsPool.acquireConnection(testId)

        expect(mockRedisClient.multi).toHaveBeenCalled()
        const multiChain = mockRedisClient.multi()

        expect(multiChain.set).toHaveBeenCalledWith(expectedKey, JSON.stringify(expectedData), {
          NX: true,
          EX: Math.ceil(300000 / 1000)
        })
        expect(multiChain.sAdd).toHaveBeenCalledWith('ws:conn_ids', testId)
        expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, expect.any(Number))
      })
    })

    describe('and the transaction fails', () => {
      beforeEach(() => {
        const mockFailedMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null)
        }
        mockRedisClient.multi.mockReturnValue(mockFailedMulti)
      })

      it('should throw an error and clean up partial state', async () => {
        await expect(wsPool.acquireConnection(testId)).rejects.toThrow('Transaction failed')

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith(expectedKey)
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', testId)
      })
    })

    describe('and the connection already exists', () => {
      beforeEach(() => {
        const mockFailedMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([null, 0])
        }
        mockRedisClient.multi.mockReturnValue(mockFailedMulti)
      })

      it('should throw an error and clean up partial state', async () => {
        await expect(wsPool.acquireConnection(testId)).rejects.toThrow('Connection already exists')

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith(expectedKey)
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', testId)
      })
    })
  })

  describe('when releasing a connection', () => {
    describe('and the connection exists and is successfully removed', () => {
      beforeEach(() => {
        const mockMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([1, 1])
        }
        mockRedisClient.multi.mockReturnValue(mockMulti)
        mockRedis.get.mockResolvedValueOnce({ startTime: now - 10000, lastActivity: now - 5000 })
        mockRedisClient.sCard.mockResolvedValue(0)
      })

      it('should remove the connection and update metrics', async () => {
        await wsPool.releaseConnection('test-1')

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
        expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 0)
        expect(mockMetrics.observe).toHaveBeenCalledWith('ws_connection_duration_seconds', {}, expect.any(Number))
      })
    })

    describe('and the connection was already released', () => {
      beforeEach(() => {
        const mockMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([0, 0])
        }
        mockRedisClient.multi.mockReturnValue(mockMulti)
      })

      it('should not update metrics and log a warning', async () => {
        await wsPool.releaseConnection('test-1')

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
        expect(mockMetrics.observe).not.toHaveBeenCalledWith(
          'ws_active_connections',
          { type: 'total' },
          expect.any(Number)
        )
      })
    })

    describe('and the transaction fails', () => {
      beforeEach(() => {
        const mockFailedMulti = {
          set: jest.fn().mockReturnThis(),
          sAdd: jest.fn().mockReturnThis(),
          sRem: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null)
        }
        mockRedisClient.multi.mockReturnValue(mockFailedMulti)
      })

      it('should not update metrics', async () => {
        await wsPool.releaseConnection('test-1')

        expect(mockRedisClient.multi().del).toHaveBeenCalledWith('ws:conn:test-1')
        expect(mockRedisClient.multi().sRem).toHaveBeenCalledWith('ws:conn_ids', 'test-1')
        expect(mockMetrics.observe).not.toHaveBeenCalledWith(
          'ws_active_connections',
          { type: 'total' },
          expect.any(Number)
        )
      })
    })
  })

  describe('when updating connection activity', () => {
    it('should update the connection activity timestamp', async () => {
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

  describe('when checking if a connection is available', () => {
    describe('and the connection exists', () => {
      beforeEach(() => {
        mockRedisClient.exists.mockResolvedValueOnce(1)
      })

      it('should return true', async () => {
        const result = await wsPool.isConnectionAvailable('test-1')
        expect(result).toBe(true)
      })
    })

    describe('and the connection does not exist', () => {
      beforeEach(() => {
        mockRedisClient.exists.mockResolvedValueOnce(0)
      })

      it('should return false', async () => {
        const result = await wsPool.isConnectionAvailable('test-1')
        expect(result).toBe(false)
      })
    })
  })

  describe('when getting active connections count', () => {
    beforeEach(() => {
      mockRedisClient.sCard.mockResolvedValueOnce(5)
    })

    it('should return the number of active connections', async () => {
      const result = await wsPool.getActiveConnections()
      expect(result).toBe(5)
    })
  })

  describe('when cleaning up all connections', () => {
    const mockIterator = ['ws:conn:test-1', 'ws:conn:test-2'][Symbol.iterator]()

    beforeEach(() => {
      mockRedisClient.scanIterator.mockReturnValue(mockIterator as any)
    })

    it('should cleanup all connections and clear interval', async () => {
      await wsPool.cleanup()

      expect(mockRedisClient.multi().del).toHaveBeenCalledTimes(2)
      expect(mockRedisClient.multi().sRem).toHaveBeenCalledTimes(2)
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })
})

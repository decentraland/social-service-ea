import { createWSPoolComponent, IWSPoolComponent } from '../../../src/adapters/ws-pool-component'
import { future } from 'fp-future'
import { mockConfig, mockMetrics } from '../../mocks/components'

describe('ws-pool-component', () => {
  let wsPool: IWSPoolComponent

  beforeEach(async () => {
    jest.clearAllMocks()
    wsPool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig })
  })

  describe('initialization', () => {
    it('should initialize with default max connections if config returns falsy', async () => {
      mockConfig.getNumber.mockResolvedValueOnce(0)
      const pool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig })
      expect(pool).toBeDefined()
      // Try to acquire more than default (100) connections
      const promises = Array(101)
        .fill(0)
        .map((_, i) => pool.acquireConnection(`conn-${i}`))
      await expect(Promise.race(promises)).resolves.toBeUndefined()
    })

    it('should use configured max connections', async () => {
      mockConfig.getNumber.mockResolvedValueOnce(1)
      const pool = await createWSPoolComponent({ metrics: mockMetrics, config: mockConfig })

      // First connection should work
      await pool.acquireConnection('conn-1')

      // Second connection should not resolve immediately
      const secondConnection = pool.acquireConnection('conn-2')
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))

      await expect(Promise.race([secondConnection, timeoutPromise])).rejects.toThrow('Timeout')
    })
  })

  describe('acquireConnection', () => {
    it('should acquire connection when below limit', async () => {
      await wsPool.acquireConnection('test-1')
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 1)
    })

    it('should queue connections when at limit', async () => {
      // Acquire max connections
      await wsPool.acquireConnection('test-1')
      await wsPool.acquireConnection('test-2')

      // Try to acquire one more
      const thirdConnection = wsPool.acquireConnection('test-3')
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))

      await expect(Promise.race([thirdConnection, timeoutPromise])).rejects.toThrow('Timeout')
    })

    it('should allow acquiring connection after release', async () => {
      await wsPool.acquireConnection('test-1')
      await wsPool.acquireConnection('test-2')
      wsPool.releaseConnection('test-1')

      // Should be able to acquire a new connection
      await expect(wsPool.acquireConnection('test-3')).resolves.toBeUndefined()
    })
  })

  describe('releaseConnection', () => {
    it('should release existing connection', async () => {
      await wsPool.acquireConnection('test-1')
      wsPool.releaseConnection('test-1')
      expect(mockMetrics.observe).toHaveBeenLastCalledWith('ws_active_connections', { type: 'total' }, 0)
    })

    it('should handle releasing non-existent connection', () => {
      expect(() => wsPool.releaseConnection('non-existent')).not.toThrow()
      expect(mockMetrics.observe).not.toHaveBeenCalled()
    })

    it('should allow acquiring new connection after release', async () => {
      await wsPool.acquireConnection('test-1')
      await wsPool.acquireConnection('test-2')
      wsPool.releaseConnection('test-1')

      // Should be able to acquire a new connection
      await expect(wsPool.acquireConnection('test-3')).resolves.toBeUndefined()
    })
  })

  describe('isConnectionAvailable', () => {
    it('should return true for active connection', async () => {
      await wsPool.acquireConnection('test-1')
      expect(wsPool.isConnectionAvailable('test-1')).toBe(true)
    })

    it('should return false for non-existent connection', () => {
      expect(wsPool.isConnectionAvailable('non-existent')).toBe(false)
    })

    it('should return false for released connection', async () => {
      await wsPool.acquireConnection('test-1')
      wsPool.releaseConnection('test-1')
      expect(wsPool.isConnectionAvailable('test-1')).toBe(false)
    })
  })

  describe('getActiveConnections', () => {
    it('should return correct number of active connections', async () => {
      expect(wsPool.getActiveConnections()).toBe(0)

      await wsPool.acquireConnection('test-1')
      expect(wsPool.getActiveConnections()).toBe(1)

      await wsPool.acquireConnection('test-2')
      expect(wsPool.getActiveConnections()).toBe(2)

      wsPool.releaseConnection('test-1')
      expect(wsPool.getActiveConnections()).toBe(1)
    })
  })

  describe('metrics', () => {
    it('should update metrics on acquire and release', async () => {
      await wsPool.acquireConnection('test-1')
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', { type: 'total' }, 1)

      wsPool.releaseConnection('test-1')
      expect(mockMetrics.observe).toHaveBeenLastCalledWith('ws_active_connections', { type: 'total' }, 0)
    })

    it('should handle multiple connections in metrics', async () => {
      await wsPool.acquireConnection('test-1')
      await wsPool.acquireConnection('test-2')
      expect(mockMetrics.observe).toHaveBeenLastCalledWith('ws_active_connections', { type: 'total' }, 2)
    })
  })

  describe('concurrent operations', () => {
    it('should handle multiple concurrent acquire attempts', async () => {
      const attempts = [
        wsPool.acquireConnection('test-1'),
        wsPool.acquireConnection('test-2'),
        wsPool.acquireConnection('test-3')
      ]

      const results = await Promise.allSettled(attempts)
      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('fulfilled')
      // Third attempt should still be pending due to semaphore
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      await expect(Promise.race([attempts[2], timeoutPromise])).rejects.toThrow('Timeout')
    })
  })
})

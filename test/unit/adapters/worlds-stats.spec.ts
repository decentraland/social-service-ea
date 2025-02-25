import { createWorldsStatsComponent } from '../../../src/adapters/worlds-stats'
import { IWorldsStatsComponent } from '../../../src/types'
import { WORLD_PEERS_CACHE_KEY } from '../../../src/utils/peers'
import { mockConfig, mockLogs, mockRedis } from '../../mocks/components'

describe('WorldsStatsComponent', () => {
  let worldsStats: IWorldsStatsComponent
  let mockRedisClient: jest.Mocked<any>

  beforeEach(async () => {
    worldsStats = await createWorldsStatsComponent({
      logs: mockLogs,
      redis: mockRedis,
      config: mockConfig
    })

    mockRedisClient = mockRedis.client as jest.Mocked<any>
  })

  describe('onPeerConnect', () => {
    it('should add user to world set and set TTL', async () => {
      const address = '0x123'
      await worldsStats.onPeerConnect(address)

      expect(mockRedisClient.sAdd).toHaveBeenCalledWith(WORLD_PEERS_CACHE_KEY, address)
      expect(mockRedisClient.expire).toHaveBeenCalledWith(WORLD_PEERS_CACHE_KEY, expect.any(Number))
    })

    it('should handle errors', async () => {
      const address = '0x123'
      mockRedisClient.sAdd.mockRejectedValueOnce(new Error('Redis error'))

      await expect(worldsStats.onPeerConnect(address)).rejects.toThrow('Redis error')
    })
  })

  describe('onPeerDisconnect', () => {
    it('should remove user from world set', async () => {
      const address = '0x123'
      await worldsStats.onPeerDisconnect(address)

      expect(mockRedisClient.sRem).toHaveBeenCalledWith(WORLD_PEERS_CACHE_KEY, address)
    })

    it('should handle errors', async () => {
      const address = '0x123'
      mockRedisClient.sRem.mockRejectedValueOnce(new Error('Redis error'))

      await expect(worldsStats.onPeerDisconnect(address)).rejects.toThrow('Redis error')
    })
  })

  describe('getPeers', () => {
    it('should return list of users in world', async () => {
      const users = ['0x123', '0x456']
      mockRedisClient.sMembers.mockResolvedValueOnce(users)

      const result = await worldsStats.getPeers()
      expect(result).toEqual(users)
    })

    it('should handle errors from redis', async () => {
      mockRedisClient.sMembers.mockRejectedValueOnce(new Error('Redis error'))

      await expect(worldsStats.getPeers()).rejects.toThrow('Redis error')
    })
  })
})

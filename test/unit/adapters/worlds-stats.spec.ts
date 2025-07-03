import { createWorldsStatsComponent } from '../../../src/adapters/worlds-stats'
import { IWorldsStatsComponent } from '../../../src/types'
import { WORLD_PEERS_CACHE_KEY } from '../../../src/utils/peers'
import { mockLogs, mockRedis } from '../../mocks/components'

describe('WorldsStatsComponent', () => {
  let worldsStats: IWorldsStatsComponent

  beforeEach(async () => {
    worldsStats = await createWorldsStatsComponent({
      logs: mockLogs,
      redis: mockRedis
    })
  })

  describe('when a peer connects', () => {
    describe('and the connection succeeds', () => {
      it('should add user to world set', async () => {
        const address = '0x123'
        await worldsStats.onPeerConnect(address)

        expect(mockRedis.addToSet).toHaveBeenCalledWith(WORLD_PEERS_CACHE_KEY, address)
      })
    })

    describe('and the connection fails', () => {
      beforeEach(() => {
        mockRedis.addToSet.mockRejectedValueOnce(new Error('Redis error'))
      })

      it('should handle errors', async () => {
        const address = '0x123'
        await expect(worldsStats.onPeerConnect(address)).rejects.toThrow('Redis error')
      })
    })
  })

  describe('when a peer disconnects', () => {
    describe('and the disconnection succeeds', () => {
      it('should remove user from world set', async () => {
        const address = '0x123'
        await worldsStats.onPeerDisconnect(address)

        expect(mockRedis.removeFromSet).toHaveBeenCalledWith(WORLD_PEERS_CACHE_KEY, address)
      })
    })

    describe('and the disconnection fails', () => {
      beforeEach(() => {
        mockRedis.removeFromSet.mockRejectedValueOnce(new Error('Redis error'))
      })

      it('should handle errors', async () => {
        const address = '0x123'
        await expect(worldsStats.onPeerDisconnect(address)).rejects.toThrow('Redis error')
      })
    })
  })

  describe('when getting peers', () => {
    describe('and the retrieval succeeds', () => {
      beforeEach(() => {
        const users = ['0x123', '0x456']
        mockRedis.listSetMembers.mockResolvedValueOnce(users)
      })

      it('should return list of users in world', async () => {
        const result = await worldsStats.getPeers()
        expect(result).toEqual(['0x123', '0x456'])
      })
    })

    describe('and the retrieval fails', () => {
      beforeEach(() => {
        mockRedis.listSetMembers.mockRejectedValueOnce(new Error('Redis error'))
      })

      it('should handle errors from redis', async () => {
        await expect(worldsStats.getPeers()).rejects.toThrow('Redis error')
      })
    })
  })
})

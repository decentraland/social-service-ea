import { createClient } from 'redis'
import { createRedisComponent } from '../../../src/adapters/redis'
import { mockConfig, mockLogs } from '../../mocks/components'
import { ICacheComponent, IRedisComponent } from '../../../src/types'

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn(),
    sMembers: jest.fn()
  })
}))

describe('redis', () => {
  let redis: IRedisComponent & ICacheComponent
  let mockClient: jest.Mocked<ReturnType<typeof createClient>>

  beforeEach(async () => {
    redis = await createRedisComponent({
      logs: mockLogs,
      config: mockConfig
    })

    mockClient = createClient({ url: 'redis://localhost:6379' }) as unknown as jest.Mocked<
      ReturnType<typeof createClient>
    >
  })

  describe('when starting the redis client', () => {
    describe('and the connection succeeds', () => {
      it('should start the redis client', async () => {
        await redis.start({} as any)
        expect(mockClient.connect).toHaveBeenCalled()
      })
    })

    describe('and the connection fails', () => {
      beforeEach(() => {
        mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.start({} as any)).rejects.toThrow('Connection failed')
      })
    })
  })

  describe('when getting a value from the redis client', () => {
    describe('and the value is found', () => {
      beforeEach(() => {
        mockClient.get.mockResolvedValueOnce(JSON.stringify('value'))
      })

      it('should get a value from the redis client and parse it correctly', async () => {
        const value = await redis.get('key')
        expect(mockClient.get).toHaveBeenCalledWith('key')
        expect(value).toBe('value')
      })
    })

    describe('and the value is not found', () => {
      beforeEach(() => {
        mockClient.get.mockResolvedValueOnce(null)
      })

      it('should return null', async () => {
        const value = await redis.get('key')
        expect(mockClient.get).toHaveBeenCalledWith('key')
        expect(value).toBe(null)
      })
    })

    describe('and the get fails', () => {
      beforeEach(() => {
        mockClient.get.mockRejectedValueOnce(new Error('Get failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.get('key')).rejects.toThrow('Get failed')
      })
    })
  })

  describe('when setting a value in the redis client', () => {
    describe('and the set succeeds', () => {
      it('should set a value in the redis client with default TTL', async () => {
        await redis.put('key', 'value')
        expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify('value'), { EX: 7200 })
      })

      it('should set a value in the redis client with custom TTL', async () => {
        await redis.put('key', [], { EX: 3600 })
        expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify([]), { EX: 3600 })
      })
    })

    describe('and the set fails', () => {
      beforeEach(() => {
        mockClient.set.mockRejectedValueOnce(new Error('Set failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.put('key', 'value')).rejects.toThrow('Set failed')
      })
    })
  })

  describe('when adding a member to a set', () => {
    describe('and the add succeeds', () => {
      beforeEach(() => {
        mockClient.sAdd.mockResolvedValueOnce(1)
      })

      it('should add a member to a set', async () => {
        const result = await redis.addToSet('test-set', 'test-member')
        expect(mockClient.sAdd).toHaveBeenCalledWith('test-set', 'test-member')
        expect(result).toBe(1)
      })
    })

    describe('and the add fails', () => {
      beforeEach(() => {
        mockClient.sAdd.mockRejectedValueOnce(new Error('addToSet failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.addToSet('test-set', 'test-member')).rejects.toThrow('addToSet failed')
      })
    })
  })

  describe('when removing a member from a set', () => {
    describe('and the remove succeeds', () => {
      beforeEach(() => {
        mockClient.sRem.mockResolvedValueOnce(1)
      })

      it('should remove a member from a set', async () => {
        const result = await redis.removeFromSet('test-set', 'test-member')
        expect(mockClient.sRem).toHaveBeenCalledWith('test-set', 'test-member')
        expect(result).toBe(1)
      })
    })

    describe('and the remove fails', () => {
      beforeEach(() => {
        mockClient.sRem.mockRejectedValueOnce(new Error('removeFromSet failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.removeFromSet('test-set', 'test-member')).rejects.toThrow('removeFromSet failed')
      })
    })
  })

  describe('when getting all members from a set', () => {
    describe('and the get succeeds', () => {
      beforeEach(() => {
        const members = ['member1', 'member2', 'member3']
        mockClient.sMembers.mockResolvedValueOnce(members)
      })

      it('should get all members from a set', async () => {
        const result = await redis.listSetMembers('test-set')
        expect(mockClient.sMembers).toHaveBeenCalledWith('test-set')
        expect(result).toEqual(['member1', 'member2', 'member3'])
      })
    })

    describe('and the get fails', () => {
      beforeEach(() => {
        mockClient.sMembers.mockRejectedValueOnce(new Error('listSetMembers failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.listSetMembers('test-set')).rejects.toThrow('listSetMembers failed')
      })
    })
  })

  describe('when stopping the redis client', () => {
    describe('and the disconnection succeeds', () => {
      it('should stop the redis client', async () => {
        await redis.stop()
        expect(mockClient.quit).toHaveBeenCalled()
      })
    })

    describe('and the disconnection fails', () => {
      beforeEach(() => {
        mockClient.disconnect.mockRejectedValueOnce(new Error('Disconnection failed'))
      })

      it('should throw an error', async () => {
        await redis.stop()
        expect(mockClient.quit).toHaveBeenCalled()
      })
    })
  })
})

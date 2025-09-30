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
    mGet: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn()
  })
}))

describe('redis', () => {
  let redis: IRedisComponent & ICacheComponent
  let mockClient: ReturnType<typeof createClient>

  beforeEach(async () => {
    redis = await createRedisComponent({
      logs: mockLogs,
      config: mockConfig
    })

    mockClient = createClient({ url: 'redis://localhost:6379' })
  })

  describe('start()', () => {
    it('should start the redis client', async () => {
      await redis.start({} as any)
      expect(mockClient.connect).toHaveBeenCalled()
    })

    describe('when connect fails', () => {
      beforeEach(() => {
        mockClient.connect = jest.fn().mockRejectedValueOnce(new Error('Connection failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.start({} as any)).rejects.toThrow('Connection failed')
      })
    })
  })

  describe('get()', () => {
    describe('when key is not found', () => {
      beforeEach(() => {
        mockClient.get = jest.fn().mockResolvedValueOnce(null)
      })

      it('should return null', async () => {
        const value = await redis.get('key')
        expect(mockClient.get).toHaveBeenCalledWith('key')
        expect(value).toBe(null)
      })
    })

    describe('when key is found', () => {
      beforeEach(() => {
        mockClient.get = jest.fn().mockResolvedValueOnce(JSON.stringify('value'))
      })

      it('should parse and return the value', async () => {
        const value = await redis.get('key')
        expect(mockClient.get).toHaveBeenCalledWith('key')
        expect(value).toBe('value')
      })
    })

    describe('when get fails', () => {
      beforeEach(() => {
        mockClient.get = jest.fn().mockRejectedValueOnce(new Error('Get failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.get('key')).rejects.toThrow('Get failed')
      })
    })
  })

  describe('mGet()', () => {
    describe('when no keys are found', () => {
      beforeEach(() => {
        mockClient.mGet = jest.fn().mockResolvedValueOnce([null, null])
      })

      it('should return empty array', async () => {
        const values = await redis.mGet(['key1', 'key2'])
        expect(mockClient.mGet).toHaveBeenCalledWith(['key1', 'key2'])
        expect(values).toEqual([])
      })
    })

    describe('when all keys are found', () => {
      beforeEach(() => {
        mockClient.mGet = jest.fn().mockResolvedValueOnce([JSON.stringify('value1'), JSON.stringify('value2')])
      })

      it('should parse and return all values', async () => {
        const values = await redis.mGet(['key1', 'key2'])
        expect(mockClient.mGet).toHaveBeenCalledWith(['key1', 'key2'])
        expect(values).toEqual(['value1', 'value2'])
      })
    })

    describe('when some keys are found', () => {
      beforeEach(() => {
        mockClient.mGet = jest.fn().mockResolvedValueOnce([JSON.stringify('value1'), null, JSON.stringify('value3')])
      })

      it('should filter out null values and return only valid parsed values', async () => {
        const values = await redis.mGet(['key1', 'key2', 'key3'])
        expect(mockClient.mGet).toHaveBeenCalledWith(['key1', 'key2', 'key3'])
        expect(values).toEqual(['value1', 'value3'])
      })
    })

    describe('when mGet fails', () => {
      beforeEach(() => {
        mockClient.mGet = jest.fn().mockRejectedValueOnce(new Error('MGet failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.mGet(['key1', 'key2'])).rejects.toThrow('MGet failed')
      })
    })
  })

  describe('put()', () => {
    describe('when setting a value with default options', () => {
      it('should call set with default expiration', async () => {
        await redis.put('key', 'value')
        expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify('value'), { EX: 7200 })
      })
    })

    describe('when setting a value with custom options', () => {
      it('should call set with custom expiration', async () => {
        await redis.put('key', [], { EX: 3600 })
        expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify([]), { EX: 3600 })
      })
    })

    describe('when put fails', () => {
      beforeEach(() => {
        mockClient.set = jest.fn().mockRejectedValueOnce(new Error('Set failed'))
      })

      it('should throw an error', async () => {
        await expect(redis.put('key', 'value')).rejects.toThrow('Set failed')
      })
    })
  })

  describe('stop()', () => {
    describe('when stopping successfully', () => {
      it('should call quit on the client', async () => {
        await redis.stop()
        expect(mockClient.quit).toHaveBeenCalled()
      })
    })

    describe('when disconnect fails', () => {
      beforeEach(() => {
        mockClient.disconnect = jest.fn().mockRejectedValueOnce(new Error('Disconnection failed'))
      })

      it('should still call quit on the client', async () => {
        await redis.stop()
        expect(mockClient.quit).toHaveBeenCalled()
      })
    })
  })
})

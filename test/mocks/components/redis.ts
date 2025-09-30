import { ICacheComponent, IRedisComponent } from '../../../src/types'
import { createClient } from 'redis'

jest.mock('redis', () => {
  const mockClient = {
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    publish: jest.fn(),
    zCard: jest.fn(),
    exists: jest.fn(),
    zAdd: jest.fn(),
    multi: jest.fn(),
    zRem: jest.fn(),
    scanIterator: jest.fn(),
    duplicate: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn(),
    sMembers: jest.fn(),
    sCard: jest.fn()
  }

  return {
    createClient: jest.fn().mockReturnValue({
      ...mockClient,
      duplicate: jest.fn().mockReturnValue(mockClient)
    })
  }
})

export const mockRedis: jest.Mocked<IRedisComponent & ICacheComponent> = {
  client: createClient(),
  get: jest.fn(),
  mGet: jest.fn(),
  put: jest.fn()
}

export const createRedisMock = ({
  get,
  mGet,
  put
}: Partial<jest.Mocked<IRedisComponent & ICacheComponent>>): jest.Mocked<IRedisComponent & ICacheComponent> => {
  return {
    client: createClient(),
    get:
      get ||
      jest.fn(async (key: string) => {
        return null // Default to cache miss for tests
      }),
    mGet:
      mGet ||
      jest.fn(async (keys: string[]) => {
        return keys.map(() => null) // Default to cache miss for tests
      }),
    put:
      put ||
      jest.fn(async (key: string, value: any) => {
        // Mock implementation
      })
  }
}

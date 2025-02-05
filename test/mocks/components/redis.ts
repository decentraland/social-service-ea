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
    publish: jest.fn(),
    zCard: jest.fn(),
    exists: jest.fn(),
    zAdd: jest.fn(),
    multi: jest.fn(),
    zRem: jest.fn(),
    scanIterator: jest.fn(),
    duplicate: jest.fn()
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
  put: jest.fn()
}

import { ICacheComponent, IRedisComponent } from '../../../src/types'
import { createClient } from 'redis'

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn()
  })
}))

export const mockRedis: jest.Mocked<IRedisComponent & ICacheComponent> = {
  client: createClient(),
  get: jest.fn(),
  put: jest.fn()
}

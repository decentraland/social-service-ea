import { IPgComponent } from '@well-known-components/pg-component'

export const mockPg: jest.Mocked<IPgComponent> = {
  streamQuery: jest.fn(),
  start: jest.fn(),
  query: jest.fn(),
  getPool: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  }),
  stop: jest.fn()
}

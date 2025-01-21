import { INatsComponent, NatsEvents } from '@well-known-components/nats-component/dist/types'
import { Emitter } from 'mitt'

export const mockNats: jest.Mocked<INatsComponent> = {
  subscribe: jest.fn(),
  publish: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  events: jest.fn().mockReturnValue({
    all: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  }) as unknown as jest.Mocked<Emitter<NatsEvents>>
}

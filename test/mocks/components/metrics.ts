import { IMetricsComponent } from '@well-known-components/interfaces'

export const mockMetrics: jest.Mocked<IMetricsComponent<string>> = {
  increment: jest.fn(),
  decrement: jest.fn(),
  startTimer: jest.fn(),
  observe: jest.fn(),
  reset: jest.fn(),
  resetAll: jest.fn(),
  getValue: jest.fn()
}

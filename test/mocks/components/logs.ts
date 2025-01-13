import { IMetricsComponent } from '@well-known-components/interfaces'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { createLogComponent } from '@well-known-components/logger'

export const mockLogs: jest.Mocked<ILoggerComponent> = {
  getLogger: jest.fn().mockReturnValue({
    log: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  })
}

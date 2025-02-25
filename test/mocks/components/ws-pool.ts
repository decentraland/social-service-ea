import { IWSPoolComponent } from '../../../src/types'

export const mockWsPool: jest.Mocked<IWSPoolComponent> = {
  acquireConnection: jest.fn().mockResolvedValue(undefined),
  releaseConnection: jest.fn().mockResolvedValue(undefined),
  updateActivity: jest.fn().mockResolvedValue(undefined),
  isConnectionAvailable: jest.fn().mockResolvedValue(true),
  getActiveConnections: jest.fn().mockResolvedValue(0),
  cleanup: jest.fn().mockResolvedValue(undefined)
}

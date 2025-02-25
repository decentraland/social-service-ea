import { IRPCServerComponent } from '../../../src/types'

export const mockRpcServer: jest.Mocked<IRPCServerComponent> = {
  attachUser: jest.fn(),
  detachUser: jest.fn()
}

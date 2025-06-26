import { IRPCServerComponent } from '../../../src/types'

export const mockRpcServer: jest.Mocked<IRPCServerComponent> = {
  attachUser: jest.fn(),
  detachUser: jest.fn(),
  setServiceCreators: jest.fn()
}

export const createMockRpcServer = ({
  attachUser = jest.fn(),
  detachUser = jest.fn(),
  setServiceCreators = jest.fn()
}: Partial<jest.Mocked<IRPCServerComponent>>): jest.Mocked<IRPCServerComponent> => {
  return {
    attachUser,
    detachUser,
    setServiceCreators
  }
}

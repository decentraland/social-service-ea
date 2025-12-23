import { IRegistryComponent } from '../../../src/types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export const mockRegistry: jest.Mocked<IRegistryComponent> = {
  getProfiles: jest.fn(),
  getProfile: jest.fn()
}

export const createMockRegistry = (): jest.Mocked<IRegistryComponent> => ({
  getProfiles: jest.fn(),
  getProfile: jest.fn()
})


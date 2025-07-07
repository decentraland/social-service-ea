import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { IWsPoolComponent } from '../../../src/logic/ws-pool'

export function createWsPoolMockedComponent(
  overrides: Partial<jest.Mocked<IWsPoolComponent>> = {}
): jest.Mocked<IWsPoolComponent> {
  return {
    registerConnection: jest.fn(),
    unregisterConnection: jest.fn(),
    [STOP_COMPONENT]: jest.fn(),
    ...overrides
  }
}

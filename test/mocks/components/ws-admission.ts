import { IWsAdmissionComponent } from '../../../src/logic/ws-admission'

export function createWsAdmissionMockedComponent(
  overrides: Partial<jest.Mocked<IWsAdmissionComponent>> = {}
): jest.Mocked<IWsAdmissionComponent> {
  return {
    claimConnection: jest.fn().mockReturnValue({}),
    admitSubscription: jest.fn(),
    releaseConnection: jest.fn(),
    ...overrides
  }
}

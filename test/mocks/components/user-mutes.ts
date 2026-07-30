import { IUserMutesComponent } from '../../../src/logic/user-mutes/types'

export function createUserMutesMockedComponent(
  overrides: Partial<jest.Mocked<IUserMutesComponent>> = {}
): jest.Mocked<IUserMutesComponent> {
  return {
    muteUser: jest.fn(),
    unmuteUser: jest.fn(),
    getMutedUsers: jest.fn(),
    ...overrides
  }
}

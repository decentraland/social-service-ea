import { IUserMutesDatabaseComponent } from '../../../src/types/components'

export const mockUserMutesDb: jest.Mocked<IUserMutesDatabaseComponent> = {
  addMute: jest.fn(),
  removeMute: jest.fn(),
  getMutedUsers: jest.fn()
}

export function createUserMutesDbMockedComponent(
  overrides: Partial<jest.Mocked<IUserMutesDatabaseComponent>> = {}
): jest.Mocked<IUserMutesDatabaseComponent> {
  return {
    addMute: jest.fn(),
    removeMute: jest.fn(),
    getMutedUsers: jest.fn(),
    ...overrides
  }
}

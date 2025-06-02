import { IVoiceDatabaseComponent } from '../../../src/types'

export function createVoiceDBMockedComponent({
  areUsersBeingCalledOrCallingSomeone = jest.fn(),
  createCall = jest.fn()
}: Partial<jest.Mocked<IVoiceDatabaseComponent>>): jest.Mocked<IVoiceDatabaseComponent> {
  return {
    areUsersBeingCalledOrCallingSomeone,
    createCall
  }
}

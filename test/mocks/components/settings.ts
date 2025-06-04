import { ISettingsComponent } from '../../../src/logic/settings'

export function createSettingsMockedComponent({
  getUsersSettings = jest.fn()
}: Partial<jest.Mocked<ISettingsComponent>>): jest.Mocked<ISettingsComponent> {
  return {
    getUsersSettings
  }
}

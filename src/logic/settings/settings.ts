import { AppComponents, SocialSettings } from '../../types'
import { ISettingsComponent } from './types'
import { getDefaultSettings } from './utils'

export function createSettingsComponent({ db }: Pick<AppComponents, 'db'>): ISettingsComponent {
  async function getUsersSettings(addresses: string[]): Promise<SocialSettings[]> {
    const settings = await db.getSocialSettings(addresses)
    const settingsMap = addresses.reduce(
      (acc, address) => {
        acc[address] = getDefaultSettings(address)
        return acc
      },
      {} as Record<string, SocialSettings>
    )

    for (const setting of settings) {
      settingsMap[setting.address] = setting
    }

    return Object.values(settingsMap)
  }

  return {
    getUsersSettings
  }
}

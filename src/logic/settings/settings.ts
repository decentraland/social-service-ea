import { AppComponents, SocialSettings } from '../../types'
import { ISettingsComponent } from './types'
import { getDefaultSettings } from './utils'

export function createSettingsComponent({ friendsDb }: Pick<AppComponents, 'friendsDb'>): ISettingsComponent {
  async function getUsersSettings(addresses: string[]): Promise<SocialSettings[]> {
    if (addresses.length === 0) {
      return []
    }

    const settings = await friendsDb.getSocialSettings(addresses)
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

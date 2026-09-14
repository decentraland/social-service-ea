import { AppComponents, SocialSettings } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { ISettingsComponent } from './types'
import { getDefaultSettings } from './utils'

export function createSettingsComponent({ friendsDb }: Pick<AppComponents, 'friendsDb'>): ISettingsComponent {
  async function getUsersSettings(addresses: string[]): Promise<SocialSettings[]> {
    if (addresses.length === 0) {
      return []
    }

    // Normalize up front so the default map keys match the (normalized) addresses stored in the DB.
    // Otherwise a checksummed/mixed-case input would never be overridden by its stored row and would
    // silently fall back to defaults — bypassing the user's real privacy settings.
    const normalizedAddresses = addresses.map(normalizeAddress)
    const settings = await friendsDb.getSocialSettings(normalizedAddresses)
    const settingsMap = normalizedAddresses.reduce(
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

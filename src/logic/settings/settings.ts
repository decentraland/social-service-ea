import { AppComponents, PrivateMessagesPrivacy, SocialSettings } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { ISettingsComponent, PrivateMessagesSettings, SocialSettingsUpdate } from './types'
import { getDefaultSettings } from './utils'

export function createSettingsComponent({
  friendsDb,
  commsGatekeeper
}: Pick<AppComponents, 'friendsDb' | 'commsGatekeeper'>): ISettingsComponent {
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

  async function updateUserSettings(address: string, update: SocialSettingsUpdate): Promise<SocialSettings> {
    const { private_messages_privacy: privacyUpdate, ...otherSettings } = update

    if (privacyUpdate === PrivateMessagesPrivacy.ONLY_FRIENDS) {
      // Tightening must reach Gatekeeper first. If it fails, the permissive database value is
      // left untouched and the client receives an error instead of a false success.
      try {
        await commsGatekeeper.updateUserPrivateMessagePrivacyMetadata(address, privacyUpdate)
      } catch (error) {
        // Settings Gatekeeper has no say over are still persisted, so a co-submitted change
        // is not silently discarded along with the privacy one.
        if (Object.keys(otherSettings).length > 0) {
          await friendsDb.upsertSocialSettings(address, otherSettings)
        }
        throw error
      }

      return friendsDb.upsertSocialSettings(address, update)
    }

    // Loosening is written locally first. If Gatekeeper then fails it retains the more
    // restrictive value, which is inconsistent but fail-closed and visible to the client.
    const settings = await friendsDb.upsertSocialSettings(address, update)
    if (privacyUpdate !== undefined) {
      await commsGatekeeper.updateUserPrivateMessagePrivacyMetadata(address, privacyUpdate)
    }

    return settings
  }

  async function getPrivateMessagesSettings(address: string, addresses: string[]): Promise<PrivateMessagesSettings[]> {
    const userAddresses = addresses.map((userAddress) => userAddress.toLowerCase())

    if (userAddresses.length === 0) {
      return []
    }

    const [settings, friends] = await Promise.all([
      friendsDb.getSocialSettings(userAddresses),
      friendsDb.getFriendsFromList(address, userAddresses)
    ])

    const privateMessagesSettings = new Map<string, PrivateMessagesSettings>(
      userAddresses.map((userAddress) => [
        userAddress,
        { address: userAddress, privateMessagesPrivacy: PrivateMessagesPrivacy.ALL, isFriend: false }
      ])
    )

    for (const setting of settings) {
      privateMessagesSettings.get(setting.address)!.privateMessagesPrivacy = setting.private_messages_privacy
    }

    for (const friend of friends) {
      privateMessagesSettings.get(friend.address)!.isFriend = true
    }

    return [...privateMessagesSettings.values()]
  }

  return {
    getUsersSettings,
    updateUserSettings,
    getPrivateMessagesSettings
  }
}

import { PrivateMessagesPrivacy, SocialSettings } from '../../types'

/** Most users whose private messages settings can be read in one call. */
export const MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES = 50

export type SocialSettingsUpdate = Partial<Omit<SocialSettings, 'address'>>

export type PrivateMessagesSettings = {
  address: string
  privateMessagesPrivacy: PrivateMessagesPrivacy
  /** Whether the user is a friend of the one asking. */
  isFriend: boolean
}

export type ISettingsComponent = {
  getUsersSettings: (addresses: string[]) => Promise<SocialSettings[]>
  /**
   * Stores the given settings and keeps Comms Gatekeeper in sync with the private messages privacy,
   * failing closed: whichever order the writes happen in, a failure never leaves Gatekeeper more
   * permissive than what the user asked for.
   */
  updateUserSettings: (address: string, update: SocialSettingsUpdate) => Promise<SocialSettings>
  /** The private messages privacy of each address, and whether it is a friend of `address`. */
  getPrivateMessagesSettings: (address: string, addresses: string[]) => Promise<PrivateMessagesSettings[]>
}

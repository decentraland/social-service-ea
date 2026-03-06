import {
  PrivateMessagePrivacySetting as RPCPrivateMessagePrivacySetting,
  SocialSettings as RPCSocialSettings,
  BlockedUsersMessagesVisibilitySetting as RPCBlockedUsersMessagesVisibilitySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SituationReactionsVisibility as DBSituationReactionsVisibility,
  SocialSettings as DBSocialSettings,
  User
} from '../../types'

const DEFAULT_DB_PRIVATE_MESSAGES_PRIVACY = DBPrivateMessagesPrivacy.ALL
const DEFAULT_RPC_PRIVATE_MESSAGE_PRIVACY = RPCPrivateMessagePrivacySetting.ALL

const RPC_PRIVATE_MESSAGE_PRIVACY_TO_DB_PRIVATE_MESSAGE_PRIVACY: Record<
  RPCPrivateMessagePrivacySetting,
  DBPrivateMessagesPrivacy | undefined
> = {
  [RPCPrivateMessagePrivacySetting.ONLY_FRIENDS]: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
  [RPCPrivateMessagePrivacySetting.ALL]: DBPrivateMessagesPrivacy.ALL,
  [RPCPrivateMessagePrivacySetting.UNRECOGNIZED]: undefined
}

const RPC_BLOCKED_USERS_MESSAGES_VISIBILITY_TO_DB_BLOCKED_USERS_MESSAGES_VISIBILITY: Record<
  RPCBlockedUsersMessagesVisibilitySetting,
  DBBlockedUsersMessagesVisibilitySetting | undefined
> = {
  [RPCBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES]: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
  [RPCBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES]:
    DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
  [RPCBlockedUsersMessagesVisibilitySetting.UNRECOGNIZED]: undefined
}

const DB_PRIVATE_MESSAGE_PRIVACY_TO_RPC_PRIVATE_MESSAGE_PRIVACY: Record<
  DBPrivateMessagesPrivacy,
  RPCPrivateMessagePrivacySetting
> = {
  [DBPrivateMessagesPrivacy.ONLY_FRIENDS]: RPCPrivateMessagePrivacySetting.ONLY_FRIENDS,
  [DBPrivateMessagesPrivacy.ALL]: RPCPrivateMessagePrivacySetting.ALL
}

const DB_BLOCKED_USERS_MESSAGES_VISIBILITY_TO_RPC_BLOCKED_USERS_MESSAGES_VISIBILITY: Record<
  DBBlockedUsersMessagesVisibilitySetting,
  RPCBlockedUsersMessagesVisibilitySetting
> = {
  [DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES]: RPCBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
  [DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES]:
    RPCBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
}

// Situation reactions visibility mappings
// RPC enum values are prepared for when @dcl/protocol adds the SituationReactionsVisibility enum
const RPC_SITUATION_REACTIONS_VISIBILITY_TO_DB: Record<number, DBSituationReactionsVisibility | undefined> = {
  0: DBSituationReactionsVisibility.SHOW,
  1: DBSituationReactionsVisibility.HIDE,
  [-1]: undefined // UNRECOGNIZED
}

const DB_SITUATION_REACTIONS_VISIBILITY_TO_RPC: Record<DBSituationReactionsVisibility, number> = {
  [DBSituationReactionsVisibility.SHOW]: 0,
  [DBSituationReactionsVisibility.HIDE]: 1
}

export class InvalidSocialSettingsError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function convertDBSettingsToRPCSettings(settings: DBSocialSettings): RPCSocialSettings {
  return {
    privateMessagesPrivacy:
      DB_PRIVATE_MESSAGE_PRIVACY_TO_RPC_PRIVATE_MESSAGE_PRIVACY[settings.private_messages_privacy],
    blockedUsersMessagesVisibility:
      DB_BLOCKED_USERS_MESSAGES_VISIBILITY_TO_RPC_BLOCKED_USERS_MESSAGES_VISIBILITY[
        settings.blocked_users_messages_visibility
      ],
    showSituationReactions: DB_SITUATION_REACTIONS_VISIBILITY_TO_RPC[settings.show_situation_reactions]
  } as RPCSocialSettings
}

export function convertRPCSettingsIntoDBSettings(
  settings: Partial<RPCSocialSettings>
): Partial<Omit<DBSocialSettings, 'address'>> {
  const dbSettings: Partial<Omit<DBSocialSettings, 'address'>> = {}

  if (settings.privateMessagesPrivacy !== undefined) {
    dbSettings.private_messages_privacy = convertRPCPrivateMessagesPrivacyIntoDBSetting(settings.privateMessagesPrivacy)
  }

  if (settings.blockedUsersMessagesVisibility !== undefined) {
    dbSettings.blocked_users_messages_visibility = convertRPCBlockedUsersMessagesVisibilityIntoDBSetting(
      settings.blockedUsersMessagesVisibility
    )
  }

  const showSituationReactions = (settings as Record<string, unknown>).showSituationReactions
  if (showSituationReactions !== undefined) {
    dbSettings.show_situation_reactions = convertRPCSituationReactionsVisibilityIntoDBSetting(
      showSituationReactions as number
    )
  }

  return dbSettings
}

function convertRPCPrivateMessagesPrivacyIntoDBSetting(
  privacy: RPCPrivateMessagePrivacySetting
): DBPrivateMessagesPrivacy {
  const dbPrivacy = RPC_PRIVATE_MESSAGE_PRIVACY_TO_DB_PRIVATE_MESSAGE_PRIVACY[privacy]
  if (dbPrivacy === undefined) {
    throw new InvalidSocialSettingsError('Unknown private messages privacy setting')
  }
  return dbPrivacy
}

function convertRPCBlockedUsersMessagesVisibilityIntoDBSetting(
  visibility: RPCBlockedUsersMessagesVisibilitySetting
): DBBlockedUsersMessagesVisibilitySetting {
  const dbVisibility = RPC_BLOCKED_USERS_MESSAGES_VISIBILITY_TO_DB_BLOCKED_USERS_MESSAGES_VISIBILITY[visibility]
  if (dbVisibility === undefined) {
    throw new InvalidSocialSettingsError('Unknown blocked users messages visibility setting')
  }
  return dbVisibility
}

function convertRPCSituationReactionsVisibilityIntoDBSetting(
  visibility: number
): DBSituationReactionsVisibility {
  const dbVisibility = RPC_SITUATION_REACTIONS_VISIBILITY_TO_DB[visibility]
  if (dbVisibility === undefined) {
    throw new InvalidSocialSettingsError('Unknown situation reactions visibility setting')
  }
  return dbVisibility
}

export function getDefaultSettings(address: string): DBSocialSettings {
  return {
    address,
    private_messages_privacy: DEFAULT_DB_PRIVATE_MESSAGES_PRIVACY,
    blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
    show_situation_reactions: DBSituationReactionsVisibility.SHOW
  }
}

export function buildPrivateMessagesRPCSettingsForAddresses(
  addresses: string[],
  settings: DBSocialSettings[],
  friends: User[]
): Record<string, { privacy: RPCPrivateMessagePrivacySetting; isFriend: boolean }> {
  // Create base message privacy information map
  const privacyInformation = addresses.reduce(
    (acc, address) => {
      acc[address] = { privacy: DEFAULT_RPC_PRIVATE_MESSAGE_PRIVACY, isFriend: false }
      return acc
    },
    {} as Record<string, { privacy: RPCPrivateMessagePrivacySetting; isFriend: boolean }>
  )

  settings.forEach((setting) => {
    privacyInformation[setting.address].privacy = convertDBSettingsToRPCSettings(setting).privateMessagesPrivacy
  })

  friends.forEach((friend) => {
    privacyInformation[friend.address].isFriend = true
  })

  return privacyInformation
}

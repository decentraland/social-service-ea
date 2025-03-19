import {
  PrivateMessagePrivacySetting as RPCPrivateMessagePrivacySetting,
  SocialSettings as RPCSocialSettings,
  BlockedUsersMessagesVisibilitySetting as RPCBlockedUsersMessagesVisibilitySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings
} from '../types'

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
      ]
  }
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

export function getDefaultSettings(address: string): DBSocialSettings {
  return {
    address,
    private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
    blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
  }
}

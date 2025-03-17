import {
  PrivateMessagePrivacySetting as PrivateMessagePrivacySettingResponse,
  SocialSettings as SocialSettingsResponse,
  BlockedUsersMessagesVisibilitySetting as BlockedUsersMessagesVisibilitySettingResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { BlockedUsersMessagesVisibilitySetting, PrivateMessagesPrivacy, SocialSettings } from '../types'

export class InvalidSocialSettingsError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function convertDBSettingsToRPCSettings(settings: SocialSettings): SocialSettingsResponse {
  return {
    privateMessagesPrivacy: convertDbPrivateMessagesPrivacyIntoRPCSetting(settings.private_messages_privacy),
    blockedUsersMessagesVisibility: convertDbBlockedUsersMessagesVisibilityIntoRPCSetting(
      settings.blocked_users_messages_visibility
    )
  }
}

export function convertRPCSettingsIntoDBSettings(
  settings: Partial<SocialSettingsResponse>
): Partial<Omit<SocialSettings, 'address'>> {
  const dbSettings: Partial<Omit<SocialSettings, 'address'>> = {}

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

function convertDbPrivateMessagesPrivacyIntoRPCSetting(
  privacy: PrivateMessagesPrivacy
): PrivateMessagePrivacySettingResponse {
  switch (privacy) {
    case PrivateMessagesPrivacy.ONLY_FRIENDS:
      return PrivateMessagePrivacySettingResponse.ONLY_FRIENDS
    case PrivateMessagesPrivacy.ALL:
      return PrivateMessagePrivacySettingResponse.ALL
  }
}

function convertRPCPrivateMessagesPrivacyIntoDBSetting(
  privacy: PrivateMessagePrivacySettingResponse
): PrivateMessagesPrivacy {
  switch (privacy) {
    case PrivateMessagePrivacySettingResponse.ONLY_FRIENDS:
      return PrivateMessagesPrivacy.ONLY_FRIENDS
    case PrivateMessagePrivacySettingResponse.ALL:
      return PrivateMessagesPrivacy.ALL
    default:
      throw new InvalidSocialSettingsError('Unknown private messages privacy setting')
  }
}

function convertDbBlockedUsersMessagesVisibilityIntoRPCSetting(
  visibility: BlockedUsersMessagesVisibilitySetting
): BlockedUsersMessagesVisibilitySettingResponse {
  switch (visibility) {
    case BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES:
      return BlockedUsersMessagesVisibilitySettingResponse.SHOW_MESSAGES
    case BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES:
      return BlockedUsersMessagesVisibilitySettingResponse.DO_NOT_SHOW_MESSAGES
  }
}

function convertRPCBlockedUsersMessagesVisibilityIntoDBSetting(
  visibility: BlockedUsersMessagesVisibilitySettingResponse
): BlockedUsersMessagesVisibilitySetting {
  switch (visibility) {
    case BlockedUsersMessagesVisibilitySettingResponse.SHOW_MESSAGES:
      return BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    case BlockedUsersMessagesVisibilitySettingResponse.DO_NOT_SHOW_MESSAGES:
      return BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    default:
      throw new InvalidSocialSettingsError('Unknown blocked users messages visibility setting')
  }
}
export function getDefaultSettings(address: string): SocialSettings {
  return {
    address,
    private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
    blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
  }
}

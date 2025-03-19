import {
  PrivateMessagePrivacySetting,
  BlockedUsersMessagesVisibilitySetting,
  SocialSettings
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  convertDBSettingsToRPCSettings,
  convertRPCSettingsIntoDBSettings,
  getDefaultSettings
} from '../../../src/logic/settings'
import {
  BlockedUsersMessagesVisibilitySetting as DBBlockedVisibility,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings
} from '../../../src/types'

describe('convertDBSettingsToRPCSettings', () => {
  it.each([
    [DBPrivateMessagesPrivacy.ALL, PrivateMessagePrivacySetting.ALL],
    [DBPrivateMessagesPrivacy.ONLY_FRIENDS, PrivateMessagePrivacySetting.ONLY_FRIENDS]
  ])('should convert the DB private messages setting "%s" to RPC settings', (dbPrivacy, rpcPrivacy) => {
    const dbSettings: DBSocialSettings = {
      address: '0x123',
      private_messages_privacy: dbPrivacy,
      blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
    }

    expect(convertDBSettingsToRPCSettings(dbSettings)).toEqual({
      privateMessagesPrivacy: rpcPrivacy,
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    })
  })

  it.each([
    [DBBlockedVisibility.DO_NOT_SHOW_MESSAGES, BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES],
    [DBBlockedVisibility.SHOW_MESSAGES, BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES]
  ])(
    'should convert the DB blocked users messages visibility setting "%s" to RPC settings',
    (dbVisibility, rpcVisibility) => {
      const dbSettings: DBSocialSettings = {
        address: '0x123',
        private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
        blocked_users_messages_visibility: dbVisibility
      }

      expect(convertDBSettingsToRPCSettings(dbSettings)).toEqual({
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL,
        blockedUsersMessagesVisibility: rpcVisibility
      })
    }
  )
})

describe('convertRPCSettingsIntoDBSettings', () => {
  it.each([
    [PrivateMessagePrivacySetting.ALL, DBPrivateMessagesPrivacy.ALL],
    [PrivateMessagePrivacySetting.ONLY_FRIENDS, DBPrivateMessagesPrivacy.ONLY_FRIENDS]
  ])('should convert the RPC private messages setting "%s" to DB settings', (rpcPrivacy, dbPrivacy) => {
    const rpcSettings: Partial<SocialSettings> = {
      privateMessagesPrivacy: rpcPrivacy,
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }

    expect(convertRPCSettingsIntoDBSettings(rpcSettings)).toEqual({
      private_messages_privacy: dbPrivacy,
      blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
    })
  })

  it.each([
    [BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES, DBBlockedVisibility.SHOW_MESSAGES],
    [BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES, DBBlockedVisibility.DO_NOT_SHOW_MESSAGES]
  ])(
    'should convert the RPC blocked users messages visibility setting "%s" to DB settings',
    (rpcVisibility, dbVisibility) => {
      const rpcSettings: Partial<SocialSettings> = {
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
        blockedUsersMessagesVisibility: rpcVisibility
      }

      expect(convertRPCSettingsIntoDBSettings(rpcSettings)).toEqual({
        private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
        blocked_users_messages_visibility: dbVisibility
      })
    }
  )

  it('should handle partial RPC settings', () => {
    const rpcSettings = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL
    }

    expect(convertRPCSettingsIntoDBSettings(rpcSettings)).toEqual({
      private_messages_privacy: DBPrivateMessagesPrivacy.ALL
    })
  })

  it('should throw error for unknown private messages privacy setting', () => {
    const rpcSettings = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.UNRECOGNIZED
    }

    expect(() => convertRPCSettingsIntoDBSettings(rpcSettings)).toThrow('Unknown private messages privacy setting')
  })

  it('should throw error for unknown blocked users messages visibility setting', () => {
    const rpcSettings = {
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.UNRECOGNIZED
    }

    expect(() => convertRPCSettingsIntoDBSettings(rpcSettings)).toThrow(
      'Unknown blocked users messages visibility setting'
    )
  })
})

describe('getDefaultSettings', () => {
  it('should return default settings with the provided address', () => {
    const address = '0xabc123'
    const defaultSettings = getDefaultSettings(address)

    expect(defaultSettings).toEqual({
      address,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
    })
  })
})

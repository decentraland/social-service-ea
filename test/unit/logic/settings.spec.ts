import {
  PrivateMessagePrivacySetting,
  BlockedUsersMessagesVisibilitySetting,
  SocialSettings
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  convertDBSettingsToRPCSettings,
  convertRPCSettingsIntoDBSettings,
  getDefaultSettings,
  buildPrivateMessagesRPCSettingsForAddresses
} from '../../../src/logic/settings'
import {
  BlockedUsersMessagesVisibilitySetting as DBBlockedVisibility,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings,
  User
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
      private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
      blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
    })
  })
})

describe('buildPrivateMessagesRPCSettingsForAddresses', () => {
  describe('when the addresses have no settings nor friends', () => {
    let addresses: string[]
    let settings: DBSocialSettings[]
    let friends: User[]
    let result: Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>

    beforeEach(() => {
      addresses = ['0x123', '0x456', '0x789']
      settings = []
      friends = []
      result = buildPrivateMessagesRPCSettingsForAddresses(addresses, settings, friends)
    })

    it('should return default ALL privacy setting and isFriend as false for all addresses', () => {
      expect(result).toEqual({
        '0x123': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false },
        '0x456': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false },
        '0x789': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false }
      })
    })
  })

  describe('when the addresses have user settings but no there are no friends records', () => {
    let addresses: string[]
    let settings: DBSocialSettings[]
    let friends: User[]
    let result: Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>

    beforeEach(() => {
      addresses = ['0x123', '0x456', '0x789']
      settings = [
        {
          address: '0x123',
          private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
        },
        {
          address: '0x789',
          private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
        }
      ]
      friends = []
      result = buildPrivateMessagesRPCSettingsForAddresses(addresses, settings, friends)
    })

    it('should return the user settings for the requested addresses and false for isFriend', () => {
      expect(result).toEqual({
        '0x123': { privacy: PrivateMessagePrivacySetting.ONLY_FRIENDS, isFriend: false },
        '0x456': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false },
        '0x789': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false }
      })
    })
  })

  describe('when the addresses have friends records but no there are no user settings', () => {
    let addresses: string[]
    let settings: DBSocialSettings[]
    let friends: User[]
    let result: Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>

    beforeEach(() => {
      addresses = ['0x123', '0x456', '0x789']
      settings = []
      friends = [{ address: '0x123' }, { address: '0x789' }]
      result = buildPrivateMessagesRPCSettingsForAddresses(addresses, settings, friends)
    })

    it('should return the if a user is friend or not and the default ALL privacy setting for the requested addresses', () => {
      expect(result).toEqual({
        '0x123': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: true },
        '0x456': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false },
        '0x789': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: true }
      })
    })
  })

  describe('when the addresses have user settings and friends records', () => {
    let addresses: string[]
    let settings: DBSocialSettings[]
    let friends: User[]
    let result: Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>

    beforeEach(() => {
      addresses = ['0x123', '0x456', '0x789']
      settings = [
        {
          address: '0x123',
          private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: DBBlockedVisibility.SHOW_MESSAGES
        }
      ]
      friends = [{ address: '0x456' }]
      result = buildPrivateMessagesRPCSettingsForAddresses(addresses, settings, friends)
    })

    it('should return the user settings for the requested addresses and the friends status', () => {
      expect(result).toEqual({
        '0x123': { privacy: PrivateMessagePrivacySetting.ONLY_FRIENDS, isFriend: false },
        '0x456': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: true },
        '0x789': { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false }
      })
    })
  })

  describe('when the addresses array is empty', () => {
    let addresses: string[]
    let settings: DBSocialSettings[]
    let friends: User[]
    let result: Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>

    beforeEach(() => {
      addresses = []
      settings = []
      friends = []
      result = buildPrivateMessagesRPCSettingsForAddresses(addresses, settings, friends)
    })

    it('should return an empty object', () => {
      expect(result).toEqual({})
    })
  })
})

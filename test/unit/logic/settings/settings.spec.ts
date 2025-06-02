import { createSettingsComponent } from '../../../../src/logic/settings/settings'
import { ISettingsComponent } from '../../../../src/logic/settings/types'
import {
  SocialSettings,
  IFriendsDatabaseComponent,
  PrivateMessagesPrivacy,
  BlockedUsersMessagesVisibilitySetting
} from '../../../../src/types'

describe('Settings Component', () => {
  let settingsComponent: ISettingsComponent
  let dbMock: jest.Mocked<IFriendsDatabaseComponent>

  beforeEach(() => {
    dbMock = {
      getSocialSettings: jest.fn()
    } as unknown as jest.Mocked<IFriendsDatabaseComponent>
    settingsComponent = createSettingsComponent({ friendsDb: dbMock })
  })

  describe('getUsersSettings', () => {
    describe('when settings exist in the database for all requested addresses', () => {
      let addresses: string[]
      let dbSettings: SocialSettings[]

      beforeEach(() => {
        addresses = ['address1', 'address2']
        dbSettings = [
          {
            address: 'address1',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          },
          {
            address: 'address2',
            private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
          }
        ]
        dbMock.getSocialSettings.mockResolvedValue(dbSettings)
      })

      it('should return the settings from the database', async () => {
        const result = await settingsComponent.getUsersSettings(addresses)
        expect(dbMock.getSocialSettings).toHaveBeenCalledWith(addresses)
        expect(result).toEqual(dbSettings)
      })
    })

    describe('when a user has no settings in the database', () => {
      let addresses: string[]
      let expectedDefaultSettings: SocialSettings[]

      beforeEach(() => {
        addresses = ['address1']
        expectedDefaultSettings = [
          {
            address: 'address1',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          }
        ]
        dbMock.getSocialSettings.mockResolvedValue([])
      })

      it('should return default settings for that user', async () => {
        const result = await settingsComponent.getUsersSettings(addresses)
        expect(dbMock.getSocialSettings).toHaveBeenCalledWith(addresses)
        expect(result).toEqual(expectedDefaultSettings)
      })
    })

    describe('when there is a mix of users with and without settings in the database', () => {
      let addresses: string[]
      let dbSettingsFromDB: SocialSettings[]
      let expectedMixedSettings: SocialSettings[]

      beforeEach(() => {
        addresses = ['address1', 'address2', 'address3']
        dbSettingsFromDB = [
          {
            address: 'address1',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          }
        ]
        expectedMixedSettings = [
          {
            address: 'address1',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          },
          {
            address: 'address2',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          },
          {
            address: 'address3',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
          }
        ]
        dbMock.getSocialSettings.mockResolvedValue(dbSettingsFromDB)
      })

      it('should return existing settings for users found and default for others', async () => {
        const result = await settingsComponent.getUsersSettings(addresses)
        expect(dbMock.getSocialSettings).toHaveBeenCalledWith(addresses)
        expect(result).toEqual(expectedMixedSettings)
      })
    })

    describe('when given an empty array of addresses', () => {
      let addresses: string[]

      beforeEach(() => {
        addresses = []
        dbMock.getSocialSettings.mockResolvedValue([])
      })

      it('should return an empty array', async () => {
        const result = await settingsComponent.getUsersSettings(addresses)
        expect(dbMock.getSocialSettings).toHaveBeenCalledWith(addresses)
        expect(result).toEqual([])
      })
    })
  })
})

import { createSettingsComponent } from '../../../../src/logic/settings/settings'
import { ISettingsComponent } from '../../../../src/logic/settings/types'
import {
  SocialSettings,
  IFriendsDatabaseComponent,
  PrivateMessagesPrivacy,
  BlockedUsersMessagesVisibilitySetting,
  SituationReactionsVisibility,
  ICommsGatekeeperComponent
} from '../../../../src/types'
import { createCommsGatekeeperMockedComponent } from '../../../mocks/components/comms-gatekeeper'

describe('Settings Component', () => {
  let settingsComponent: ISettingsComponent
  let dbMock: jest.Mocked<IFriendsDatabaseComponent>
  let commsGatekeeperMock: jest.Mocked<ICommsGatekeeperComponent>

  beforeEach(() => {
    dbMock = {
      getSocialSettings: jest.fn(),
      getFriendsFromList: jest.fn(),
      upsertSocialSettings: jest.fn()
    } as unknown as jest.Mocked<IFriendsDatabaseComponent>
    commsGatekeeperMock = createCommsGatekeeperMockedComponent({}) as jest.Mocked<ICommsGatekeeperComponent>
    settingsComponent = createSettingsComponent({ friendsDb: dbMock, commsGatekeeper: commsGatekeeperMock })
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
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
          },
          {
            address: 'address2',
            private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
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
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
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
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
          }
        ]
        expectedMixedSettings = [
          {
            address: 'address1',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
          },
          {
            address: 'address2',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
          },
          {
            address: 'address3',
            private_messages_privacy: PrivateMessagesPrivacy.ALL,
            blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
            show_situation_reactions: SituationReactionsVisibility.SHOW
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
        expect(dbMock.getSocialSettings).not.toHaveBeenCalledWith(addresses)
        expect(result).toEqual([])
      })
    })
  })

  describe('updateUserSettings', () => {
    const address = '0x1234567890123456789012345678901234567890'
    let storedSettings: SocialSettings

    beforeEach(() => {
      storedSettings = {
        address,
        private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
        blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
        show_situation_reactions: SituationReactionsVisibility.SHOW
      }
      dbMock.upsertSocialSettings.mockResolvedValue(storedSettings)
    })

    describe('when the private messages privacy is tightened to only friends', () => {
      let calls: string[]

      beforeEach(() => {
        calls = []
        commsGatekeeperMock.updateUserPrivateMessagePrivacyMetadata.mockImplementation(async () => {
          calls.push('gatekeeper')
        })
        dbMock.upsertSocialSettings.mockImplementation(async () => {
          calls.push('database')
          return storedSettings
        })
      })

      it('should update Gatekeeper before storing the settings and return the stored settings', async () => {
        const result = await settingsComponent.updateUserSettings(address, {
          private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
        })

        expect(calls).toEqual(['gatekeeper', 'database'])
        expect(result).toBe(storedSettings)
      })
    })

    describe('when tightening the privacy fails in Gatekeeper', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('gatekeeper down')
        commsGatekeeperMock.updateUserPrivateMessagePrivacyMetadata.mockRejectedValue(error)
      })

      describe('and other settings were submitted along with it', () => {
        it('should store only the other settings and rethrow the error', async () => {
          await expect(
            settingsComponent.updateUserSettings(address, {
              private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
              show_situation_reactions: SituationReactionsVisibility.HIDE
            })
          ).rejects.toBe(error)

          expect(dbMock.upsertSocialSettings).toHaveBeenCalledTimes(1)
          expect(dbMock.upsertSocialSettings).toHaveBeenCalledWith(address, {
            show_situation_reactions: SituationReactionsVisibility.HIDE
          })
        })
      })

      describe('and nothing else was submitted', () => {
        it('should store nothing and rethrow the error', async () => {
          await expect(
            settingsComponent.updateUserSettings(address, {
              private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
            })
          ).rejects.toBe(error)

          expect(dbMock.upsertSocialSettings).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the private messages privacy is loosened to all', () => {
      let calls: string[]

      beforeEach(() => {
        calls = []
        commsGatekeeperMock.updateUserPrivateMessagePrivacyMetadata.mockImplementation(async () => {
          calls.push('gatekeeper')
        })
        dbMock.upsertSocialSettings.mockImplementation(async () => {
          calls.push('database')
          return storedSettings
        })
      })

      it('should store the settings before updating Gatekeeper', async () => {
        await settingsComponent.updateUserSettings(address, { private_messages_privacy: PrivateMessagesPrivacy.ALL })

        expect(calls).toEqual(['database', 'gatekeeper'])
      })
    })

    describe('when loosening the privacy fails in Gatekeeper', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('gatekeeper down')
        commsGatekeeperMock.updateUserPrivateMessagePrivacyMetadata.mockRejectedValue(error)
      })

      it('should rethrow the error after storing the settings', async () => {
        await expect(
          settingsComponent.updateUserSettings(address, { private_messages_privacy: PrivateMessagesPrivacy.ALL })
        ).rejects.toBe(error)

        expect(dbMock.upsertSocialSettings).toHaveBeenCalledWith(address, {
          private_messages_privacy: PrivateMessagesPrivacy.ALL
        })
      })
    })

    describe('when the private messages privacy is not part of the update', () => {
      it('should store the settings without calling Gatekeeper', async () => {
        await settingsComponent.updateUserSettings(address, {
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        })

        expect(dbMock.upsertSocialSettings).toHaveBeenCalledWith(address, {
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        })
        expect(commsGatekeeperMock.updateUserPrivateMessagePrivacyMetadata).not.toHaveBeenCalled()
      })
    })
  })

  describe('getPrivateMessagesSettings', () => {
    const address = '0x1234567890123456789012345678901234567890'

    function settingsFor(userAddress: string, privacy: PrivateMessagesPrivacy): SocialSettings {
      return {
        address: userAddress,
        private_messages_privacy: privacy,
        blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
        show_situation_reactions: SituationReactionsVisibility.SHOW
      }
    }

    describe('when the users have settings and some are friends of the caller', () => {
      beforeEach(() => {
        dbMock.getSocialSettings.mockResolvedValue([settingsFor('0x123', PrivateMessagesPrivacy.ONLY_FRIENDS)])
        dbMock.getFriendsFromList.mockResolvedValue([{ address: '0x456' }])
      })

      it('should return each user with their privacy, defaulting to all, and whether they are friends', async () => {
        await expect(settingsComponent.getPrivateMessagesSettings(address, ['0x123', '0x456', '0x789'])).resolves.toEqual([
          { address: '0x123', privateMessagesPrivacy: PrivateMessagesPrivacy.ONLY_FRIENDS, isFriend: false },
          { address: '0x456', privateMessagesPrivacy: PrivateMessagesPrivacy.ALL, isFriend: true },
          { address: '0x789', privateMessagesPrivacy: PrivateMessagesPrivacy.ALL, isFriend: false }
        ])
      })
    })

    describe('when the addresses are not lowercased', () => {
      beforeEach(() => {
        dbMock.getSocialSettings.mockResolvedValue([])
        dbMock.getFriendsFromList.mockResolvedValue([])
      })

      it('should look them up lowercased', async () => {
        await settingsComponent.getPrivateMessagesSettings(address, ['0xABC'])

        expect(dbMock.getSocialSettings).toHaveBeenCalledWith(['0xabc'])
        expect(dbMock.getFriendsFromList).toHaveBeenCalledWith(address, ['0xabc'])
      })
    })

    describe('when no addresses are requested', () => {
      it('should return an empty list without querying', async () => {
        await expect(settingsComponent.getPrivateMessagesSettings(address, [])).resolves.toEqual([])
        expect(dbMock.getSocialSettings).not.toHaveBeenCalled()
      })
    })
  })
})

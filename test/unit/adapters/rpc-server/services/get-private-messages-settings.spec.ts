import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  GetPrivateMessagesSettingsPayload,
  PrivateMessagePrivacySetting,
  User
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPrivateMessagesSettingsService } from '../../../../../src/adapters/rpc-server/services/get-private-messages-settings'
import {
  IFriendsDatabaseComponent,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  SocialSettings as DBSocialSettings,
  RpcServerContext
} from '../../../../../src/types'

describe('getPrivateMessagesSettingsService', () => {
  const testAddress1 = '0x1234567890abcdef'
  const testAddress2 = '0xabcdef1234567890'
  let context: RpcServerContext
  let getSocialSettingsMock: jest.MockedFunction<IFriendsDatabaseComponent['getSocialSettings']>
  let getFriendsFromListMock: jest.MockedFunction<IFriendsDatabaseComponent['getFriendsFromList']>
  let getPrivateMessagesSettings: ReturnType<typeof getPrivateMessagesSettingsService>

  beforeEach(() => {
    getSocialSettingsMock = jest.fn()
    getFriendsFromListMock = jest.fn()
    const db = {
      getSocialSettings: getSocialSettingsMock,
      getFriendsFromList: getFriendsFromListMock
    } as unknown as IFriendsDatabaseComponent
    const logs: ILoggerComponent = {
      getLogger: () => ({
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
        log: () => {}
      })
    }
    context = {
      address: 'anotherAddress',
      subscribersContext: undefined
    }
    getPrivateMessagesSettings = getPrivateMessagesSettingsService({
      components: {
        logs,
        db
      }
    })
  })

  describe('when the settings and friends status for multiple users exist', () => {
    beforeEach(() => {
      const mockSettings: DBSocialSettings[] = [
        {
          address: testAddress1,
          private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        },
        {
          address: testAddress2,
          private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
        }
      ]

      getSocialSettingsMock.mockResolvedValueOnce(mockSettings)
      getFriendsFromListMock.mockResolvedValueOnce([{ address: testAddress1 }, { address: testAddress2 }])
    })

    it('should return the privacy messages settings and the friendship status for all of them', async () => {
      const payload: GetPrivateMessagesSettingsPayload = {
        user: [{ address: testAddress1 }, { address: testAddress2 }]
      }

      const result = await getPrivateMessagesSettings(payload, context)

      expect(result.response.$case).toEqual('ok')
      if (result.response.$case === 'ok') {
        expect(result.response.ok.settings).toHaveLength(2)
        expect(result.response.ok.settings).toContainEqual({
          user: { address: testAddress1 },
          privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
          isFriend: true
        })
        expect(result.response.ok.settings).toContainEqual({
          user: { address: testAddress2 },
          privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL,
          isFriend: true
        })
      }
    })
  })

  describe('when a requested user has no saved settings nor friends', () => {
    beforeEach(() => {
      const mockFriends: User[] = [{ address: testAddress1 }]
      const mockSettings: DBSocialSettings[] = [
        {
          address: testAddress1,
          private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
        }
      ]

      getSocialSettingsMock.mockResolvedValueOnce(mockSettings)
      getFriendsFromListMock.mockResolvedValueOnce(mockFriends)
    })

    it('should return default messages privacy settings and the friendship as false', async () => {
      const payload: GetPrivateMessagesSettingsPayload = {
        user: [{ address: testAddress1 }, { address: testAddress2 }]
      }

      const result = await getPrivateMessagesSettings(payload, context)

      expect(result.response.$case).toEqual('ok')
      if (result.response.$case === 'ok') {
        expect(result.response.ok.settings).toHaveLength(2)
        expect(result.response.ok.settings).toContainEqual({
          user: { address: testAddress1 },
          privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
          isFriend: true
        })
        // The second user has no saved settings, check that the default setting is returned
        expect(result.response.ok.settings).toContainEqual({
          user: { address: testAddress2 },
          privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL,
          isFriend: false
        })
      }
    })
  })

  describe('when the requested user list is empty', () => {
    it('should return an empty list', async () => {
      const payload: GetPrivateMessagesSettingsPayload = {
        user: []
      }

      const result = await getPrivateMessagesSettings(payload, context)

      expect(result.response.$case).toEqual('ok')
      if (result.response.$case === 'ok') {
        expect(result.response.ok.settings).toHaveLength(0)
      }
    })
  })

  describe('when getting friends from list throws an error', () => {
    beforeEach(() => {
      getSocialSettingsMock.mockResolvedValueOnce([])
      getFriendsFromListMock.mockRejectedValueOnce(new Error('Database error'))
    })

    it('should return an internal server error', async () => {
      const error = new Error('Database error')
      getSocialSettingsMock.mockResolvedValueOnce([])
      getFriendsFromListMock.mockRejectedValueOnce(error)

      const payload: GetPrivateMessagesSettingsPayload = {
        user: [{ address: testAddress1 }]
      }

      const result = await getPrivateMessagesSettings(payload, context)

      expect(result.response.$case).toEqual('internalServerError')
      if (result.response.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toEqual(error.message)
      }
    })
  })

  describe('when getting social settings throws an error', () => {
    let error: Error

    beforeEach(() => {
      error = new Error('Database error')
      getSocialSettingsMock.mockRejectedValueOnce(new Error('Database error'))
      getFriendsFromListMock.mockResolvedValueOnce([])
    })

    it('should return an internal server error', async () => {
      const payload: GetPrivateMessagesSettingsPayload = {
        user: [{ address: testAddress1 }]
      }

      const result = await getPrivateMessagesSettings(payload, context)

      expect(result.response.$case).toEqual('internalServerError')
      if (result.response.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toEqual(error.message)
      }
    })
  })
})

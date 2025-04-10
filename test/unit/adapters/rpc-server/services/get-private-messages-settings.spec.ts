import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  GetPrivateMessagesSettingsPayload,
  PrivateMessagePrivacySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { getPrivateMessagesSettingsService } from '../../../../../src/adapters/rpc-server/services/get-private-messages-settings'
import {
  IDatabaseComponent,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  SocialSettings as DBSocialSettings,
  RpcServerContext
} from '../../../../../src/types'

describe('getPrivateMessagesSettingsService', () => {
  const testAddress1 = '0x1234567890abcdef'
  const testAddress2 = '0xabcdef1234567890'
  let context: RpcServerContext
  let getSocialSettingsMock: jest.MockedFunction<IDatabaseComponent['getSocialSettings']>
  let getPrivateMessagesSettings: ReturnType<typeof getPrivateMessagesSettingsService>

  beforeEach(() => {
    getSocialSettingsMock = jest.fn()
    const db = {
      getSocialSettings: getSocialSettingsMock
    } as unknown as IDatabaseComponent
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

  it('should return the only the messages privacy settings for multiple users when they exist', async () => {
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

    const payload: GetPrivateMessagesSettingsPayload = {
      user: [{ address: testAddress1 }, { address: testAddress2 }]
    }

    const result = await getPrivateMessagesSettings(payload, context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      expect(result.response.ok.settings).toHaveLength(2)
      expect(result.response.ok.settings).toContainEqual({
        user: { address: testAddress1 },
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
      })
      expect(result.response.ok.settings).toContainEqual({
        user: { address: testAddress2 },
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL
      })
    }
  })

  it('should return default messages privacy settings when a requested user has no saved settings', async () => {
    const mockSettings: DBSocialSettings[] = [
      {
        address: testAddress1,
        private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
        blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
      }
    ]

    getSocialSettingsMock.mockResolvedValueOnce(mockSettings)

    const payload: GetPrivateMessagesSettingsPayload = {
      user: [{ address: testAddress1 }, { address: testAddress2 }]
    }

    const result = await getPrivateMessagesSettings(payload, context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      expect(result.response.ok.settings).toHaveLength(2)
      expect(result.response.ok.settings).toContainEqual({
        user: { address: testAddress1 },
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
      })
      // The second user has no saved settings, check that the default setting is returned
      expect(result.response.ok.settings).toContainEqual({
        user: { address: testAddress2 },
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL
      })
    }
  })

  it('should return an empty list when the user list is empty', async () => {
    const payload: GetPrivateMessagesSettingsPayload = {
      user: []
    }

    getSocialSettingsMock.mockResolvedValueOnce([])

    const result = await getPrivateMessagesSettings(payload, context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      expect(result.response.ok.settings).toHaveLength(0)
    }
  })

  it('should return internal server error when the database throws an error', async () => {
    const error = new Error('Database error')
    getSocialSettingsMock.mockRejectedValueOnce(error)

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

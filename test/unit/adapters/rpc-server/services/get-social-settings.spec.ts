import { ILoggerComponent } from '@well-known-components/interfaces'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { getSocialSettingsService } from '../../../../../src/adapters/rpc-server/services/get-social-settings'
import { getDefaultSettings, convertDBSettingsToRPCSettings } from '../../../../../src/logic/settings'
import {
  IFriendsDatabaseComponent,
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings,
  RpcServerContext
} from '../../../../../src/types'

describe('getSocialSettingsService', () => {
  const testAddress = '0x1234567890abcdef'
  let context: RpcServerContext
  let getSocialSettingsMock: jest.MockedFunction<IFriendsDatabaseComponent['getSocialSettings']>
  let getSocialSettings: ReturnType<typeof getSocialSettingsService>

  beforeEach(() => {
    getSocialSettingsMock = jest.fn()
    const db = {
      getSocialSettings: getSocialSettingsMock
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
      address: testAddress,
      subscribersContext: undefined
    }
    getSocialSettings = getSocialSettingsService({
      components: {
        logs,
        db
      }
    })
  })

  it('should return user settings when they exist', async () => {
    const mockSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }
    getSocialSettingsMock.mockResolvedValueOnce([mockSettings])

    const result = await getSocialSettings(Empty.create(), context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(mockSettings)
      expect(result.response.ok.settings).toEqual(expectedSettings)
    }
  })

  it('should return default settings when user has no saved settings', async () => {
    // No previous settings
    getSocialSettingsMock.mockResolvedValueOnce([])
    const defaultSettings = getDefaultSettings(testAddress)

    const result = await getSocialSettings(Empty.create(), context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(defaultSettings)
      expect(result.response.ok.settings).toEqual(expectedSettings)
    }
  })

  it('should return internal server error when database throws an error', async () => {
    const error = new Error('Database error')
    getSocialSettingsMock.mockRejectedValueOnce(error)

    const result = await getSocialSettings(Empty.create(), context)

    expect(result.response.$case).toEqual('internalServerError')
    if (result.response.$case === 'internalServerError') {
      expect(result.response.internalServerError.message).toEqual(error.message)
    }
  })
})

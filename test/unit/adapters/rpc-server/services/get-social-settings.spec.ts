import { ILoggerComponent } from '@well-known-components/interfaces'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { getSocialSettingsService } from '../../../../../src/adapters/rpc-server/services/get-social-settings'
import {
  getDefaultSettings,
  convertDBSettingsToRPCSettings,
  ISettingsComponent
} from '../../../../../src/logic/settings'
import {
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings,
  RpcServerContext
} from '../../../../../src/types'
import { createSettingsMockedComponent } from '../../../../mocks/components/settings'

describe('getSocialSettingsService', () => {
  const testAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
  let context: RpcServerContext
  let getUsersSettingsMock: jest.MockedFunction<ISettingsComponent['getUsersSettings']>
  let getSocialSettings: ReturnType<typeof getSocialSettingsService>

  beforeEach(() => {
    getUsersSettingsMock = jest.fn()
    const settings = createSettingsMockedComponent({
      getUsersSettings: getUsersSettingsMock
    })
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
        settings
      }
    })
  })

  it('should return user settings when they exist', async () => {
    const mockSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }
    getUsersSettingsMock.mockResolvedValueOnce([mockSettings])

    const result = await getSocialSettings(Empty.create(), context)

    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(mockSettings)
      expect(result.response.ok.settings).toEqual(expectedSettings)
    }
  })

  it('should return default settings when user has no saved settings', async () => {
    // No previous settings
    getUsersSettingsMock.mockResolvedValueOnce([])
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
    getUsersSettingsMock.mockRejectedValueOnce(error)

    const result = await getSocialSettings(Empty.create(), context)

    expect(result.response.$case).toEqual('internalServerError')
    if (result.response.$case === 'internalServerError') {
      expect(result.response.internalServerError.message).toEqual(error.message)
    }
  })
})

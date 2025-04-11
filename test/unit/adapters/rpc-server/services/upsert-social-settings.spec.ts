import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  BlockedUsersMessagesVisibilitySetting,
  PrivateMessagePrivacySetting,
  UpsertSocialSettingsPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { upsertSocialSettingsService } from '../../../../../src/adapters/rpc-server/services/upsert-social-settings'
import { convertDBSettingsToRPCSettings } from '../../../../../src/logic/settings'
import {
  IDatabaseComponent,
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SocialSettings as DBSocialSettings,
  RpcServerContext,
  ICommsGatekeeperComponent
} from '../../../../../src/types'

describe('upsertSocialSettingsService', () => {
  const testAddress = '0x1234567890abcdef'
  let context: RpcServerContext
  let upsertSocialSettingsMock: jest.MockedFunction<IDatabaseComponent['upsertSocialSettings']>
  let upsertSocialSettings: ReturnType<typeof upsertSocialSettingsService>
  let commsGatekeeperMock: jest.MockedFunction<ICommsGatekeeperComponent['updateUserPrivateMessagePrivacyMetadata']>

  beforeEach(() => {
    upsertSocialSettingsMock = jest.fn()
    commsGatekeeperMock = jest.fn()
    const db = {
      upsertSocialSettings: upsertSocialSettingsMock
    } as unknown as IDatabaseComponent
    const commsGatekeeper: ICommsGatekeeperComponent = {
      updateUserPrivateMessagePrivacyMetadata: commsGatekeeperMock
    }
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
    upsertSocialSettings = upsertSocialSettingsService({
      components: {
        logs,
        db,
        commsGatekeeper
      }
    })
  })

  it('should update private messages privacy setting', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
    }
    const resultDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(resultDBSettings)

    const result = await upsertSocialSettings(payload, context)

    expect(upsertSocialSettingsMock).toHaveBeenCalledWith(
      testAddress,
      expect.objectContaining({
        private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS
      })
    )
    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(resultDBSettings)
      expect(result.response.ok).toEqual(expectedSettings)
    }
  })

  it('should update blocked users messages visibility setting', async () => {
    const payload: UpsertSocialSettingsPayload = {
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }

    const resultDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(resultDBSettings)

    const result = await upsertSocialSettings(payload, context)

    expect(upsertSocialSettingsMock).toHaveBeenCalledWith(
      testAddress,
      expect.objectContaining({
        blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
      })
    )
    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(resultDBSettings)
      expect(result.response.ok).toEqual(expectedSettings)
    }
  })

  it('should update multiple settings at once', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    const expectedDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)

    const result = await upsertSocialSettings(payload, context)

    expect(upsertSocialSettingsMock).toHaveBeenCalledWith(
      testAddress,
      expect.objectContaining({
        private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
        blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
      })
    )
    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      const expectedSettings = convertDBSettingsToRPCSettings(expectedDBSettings)
      expect(result.response.ok).toEqual(expectedSettings)
    }
  })

  it('should update the private message privacy metadata in the comms gatekeeper', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
    }
    const expectedDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)

    const result = await upsertSocialSettings(payload, context)
    expect(commsGatekeeperMock).toHaveBeenCalledWith(testAddress, DBPrivateMessagesPrivacy.ONLY_FRIENDS)
    expect(result.response.$case).toEqual('ok')
  })

  it('should not update the private message privacy metadata in the comms gatekeeper when the private message privacy setting is not provided', async () => {
    const payload: UpsertSocialSettingsPayload = {
      blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }
    const expectedDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)

    const result = await upsertSocialSettings(payload, context)
    expect(commsGatekeeperMock).not.toHaveBeenCalled()
    expect(result.response.$case).toEqual('ok')
  })

  it('should not reject when the comms gatekeeper throws an error', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
    }
    const expectedDBSettings: DBSocialSettings = {
      address: testAddress,
      private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS,
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
    }

    upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)
    commsGatekeeperMock.mockRejectedValueOnce(new Error('Comms gatekeeper error'))

    const result = await upsertSocialSettings(payload, context)
    expect(result.response.$case).toEqual('ok')
  })

  it('should return invalid request when no settings are provided', async () => {
    const payload: UpsertSocialSettingsPayload = {}

    const result = await upsertSocialSettings(payload, context)

    expect(upsertSocialSettingsMock).not.toHaveBeenCalled()
    expect(result.response.$case).toEqual('invalidRequest')
    if (result.response.$case === 'invalidRequest') {
      expect(result.response.invalidRequest.message).toEqual('At least one setting to update must be provided')
    }
  })

  it('should return internal server error when database throws an error', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS
    }

    const error = new Error('Database error')
    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockRejectedValueOnce(error)

    const result = await upsertSocialSettings(payload, context)

    expect(result.response.$case).toEqual('internalServerError')
    if (result.response.$case === 'internalServerError') {
      expect(result.response.internalServerError.message).toEqual(error.message)
    }
  })

  it('should return invalid request when invalid settings are provided', async () => {
    const payload: UpsertSocialSettingsPayload = {
      privateMessagesPrivacy: PrivateMessagePrivacySetting.UNRECOGNIZED
    }

    const result = await upsertSocialSettings(payload, context)

    expect(result.response.$case).toEqual('invalidRequest')
    if (result.response.$case === 'invalidRequest') {
      expect(result.response.invalidRequest.message).toEqual('Unknown private messages privacy setting')
    }
  })
})

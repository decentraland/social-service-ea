import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  BlockedUsersMessagesVisibilitySetting,
  PrivateMessagePrivacySetting,
  UpsertSocialSettingsPayload,
  UpsertSocialSettingsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { upsertSocialSettingsService } from '../../../../../src/controllers/handlers/rpc/upsert-social-settings'
import { convertDBSettingsToRPCSettings } from '../../../../../src/logic/settings'
import {
  IFriendsDatabaseComponent,
  BlockedUsersMessagesVisibilitySetting as DBBlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy as DBPrivateMessagesPrivacy,
  SituationReactionsVisibility as DBSituationReactionsVisibility,
  SocialSettings as DBSocialSettings,
  RpcServerContext,
  ICommsGatekeeperComponent
} from '../../../../../src/types'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'

describe('upsertSocialSettingsService', () => {
  const testAddress = '0x1234567890abcdef'
  let context: RpcServerContext
  let upsertSocialSettingsMock: jest.MockedFunction<IFriendsDatabaseComponent['upsertSocialSettings']>
  let upsertSocialSettings: ReturnType<typeof upsertSocialSettingsService>
  let commsGatekeeperMock: jest.MockedFunction<ICommsGatekeeperComponent['updateUserPrivateMessagePrivacyMetadata']>

  beforeEach(() => {
    upsertSocialSettingsMock = jest.fn()
    commsGatekeeperMock = jest.fn()
    const friendsDb = {
      upsertSocialSettings: upsertSocialSettingsMock
    } as unknown as IFriendsDatabaseComponent
    const commsGatekeeper: ICommsGatekeeperComponent = createCommsGatekeeperMockedComponent({
      isUserInAVoiceChat: jest.fn(),
      getPrivateVoiceChatCredentials: jest.fn(),
      updateUserPrivateMessagePrivacyMetadata: commsGatekeeperMock
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
    upsertSocialSettings = upsertSocialSettingsService({
      components: {
        logs,
        friendsDb,
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
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
      show_situation_reactions: DBSituationReactionsVisibility.SHOW
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
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES,
      show_situation_reactions: DBSituationReactionsVisibility.SHOW
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
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
      show_situation_reactions: DBSituationReactionsVisibility.SHOW
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
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
      show_situation_reactions: DBSituationReactionsVisibility.SHOW
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
      blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
      show_situation_reactions: DBSituationReactionsVisibility.SHOW
    }

    commsGatekeeperMock.mockResolvedValueOnce()
    upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)

    const result = await upsertSocialSettings(payload, context)
    expect(commsGatekeeperMock).not.toHaveBeenCalled()
    expect(result.response.$case).toEqual('ok')
  })

  describe('when Gatekeeper rejects a privacy-tightening update', () => {
    let payload: UpsertSocialSettingsPayload
    let result: UpsertSocialSettingsResponse

    beforeEach(async () => {
      payload = { privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS }
      commsGatekeeperMock.mockRejectedValueOnce(new Error('Comms gatekeeper error'))
      result = await upsertSocialSettings(payload, context)
    })

    it('should return an internal server error', () => {
      expect(result.response.$case).toEqual('internalServerError')
    })

    it('should leave the permissive database setting unchanged', () => {
      expect(upsertSocialSettingsMock).not.toHaveBeenCalled()
    })
  })

  describe('when Gatekeeper rejects a privacy-tightening update submitted alongside another setting', () => {
    let payload: UpsertSocialSettingsPayload
    let result: UpsertSocialSettingsResponse

    beforeEach(async () => {
      payload = {
        privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
        blockedUsersMessagesVisibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
      }
      commsGatekeeperMock.mockRejectedValueOnce(new Error('Comms gatekeeper error'))
      result = await upsertSocialSettings(payload, context)
    })

    it('should return an internal server error', () => {
      expect(result.response.$case).toEqual('internalServerError')
    })

    it('should still persist the setting Gatekeeper has no say over', () => {
      expect(upsertSocialSettingsMock).toHaveBeenCalledWith(testAddress, {
        blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES
      })
    })

    it('should not persist the privacy change that Gatekeeper rejected', () => {
      expect(upsertSocialSettingsMock).not.toHaveBeenCalledWith(
        testAddress,
        expect.objectContaining({ private_messages_privacy: DBPrivateMessagesPrivacy.ONLY_FRIENDS })
      )
    })
  })

  describe('when Gatekeeper rejects a privacy-loosening update', () => {
    let payload: UpsertSocialSettingsPayload
    let result: UpsertSocialSettingsResponse
    let expectedDBSettings: DBSocialSettings

    beforeEach(async () => {
      payload = { privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL }
      expectedDBSettings = {
        address: testAddress,
        private_messages_privacy: DBPrivateMessagesPrivacy.ALL,
        blocked_users_messages_visibility: DBBlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
        show_situation_reactions: DBSituationReactionsVisibility.SHOW
      }
      upsertSocialSettingsMock.mockResolvedValueOnce(expectedDBSettings)
      commsGatekeeperMock.mockRejectedValueOnce(new Error('Comms gatekeeper error'))
      result = await upsertSocialSettings(payload, context)
    })

    it('should return an internal server error', () => {
      expect(result.response.$case).toEqual('internalServerError')
    })

    it('should write the permissive database value before Gatekeeper retains its restrictive value', () => {
      expect(upsertSocialSettingsMock).toHaveBeenCalledWith(testAddress, {
        private_messages_privacy: DBPrivateMessagesPrivacy.ALL
      })
    })
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

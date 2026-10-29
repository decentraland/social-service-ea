import { InvalidRequestError } from '@dcl/http-commons'
import { getSocialSettingsHandler } from '../../../../../src/controllers/handlers/http/get-social-settings-handler'
import { updateSocialSettingsHandler } from '../../../../../src/controllers/handlers/http/update-social-settings-handler'
import { getPrivateMessagesSettingsHandler } from '../../../../../src/controllers/handlers/http/get-private-messages-settings-handler'
import { createSettingsMockedComponent } from '../../../../mocks/components/settings'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import {
  BlockedUsersMessagesVisibilitySetting,
  PrivateMessagesPrivacy,
  SituationReactionsVisibility,
  SocialSettings
} from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

let settings: ReturnType<typeof createSettingsMockedComponent>
let logs: ReturnType<typeof createLogsMockedComponent>
let storedSettings: SocialSettings

beforeEach(() => {
  settings = createSettingsMockedComponent({})
  logs = createLogsMockedComponent()
  storedSettings = {
    address: USER_ADDRESS,
    private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
    blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.DO_NOT_SHOW_MESSAGES,
    show_situation_reactions: SituationReactionsVisibility.HIDE
  }
})

describe('when getting the social settings of the caller', () => {
  beforeEach(() => {
    settings.getUsersSettings.mockResolvedValue([storedSettings])
  })

  it('should respond with the settings in the HTTP shape', async () => {
    await expect(
      getSocialSettingsHandler({ components: { settings, logs }, verification: { auth: USER_ADDRESS } as any })
    ).resolves.toEqual({
      status: 200,
      body: {
        data: {
          privateMessagesPrivacy: 'only_friends',
          blockedUsersMessagesVisibility: 'do_not_show_messages',
          showSituationReactions: 'hide'
        }
      }
    })
    expect(settings.getUsersSettings).toHaveBeenCalledWith([USER_ADDRESS])
  })
})

describe('when updating the social settings of the caller', () => {
  beforeEach(() => {
    settings.updateUserSettings.mockResolvedValue(storedSettings)
  })

  function callHandler(body: Record<string, unknown>) {
    return updateSocialSettingsHandler({
      components: { settings, logs },
      request: { json: jest.fn().mockResolvedValue(body) } as any,
      verification: { auth: USER_ADDRESS } as any
    })
  }

  it('should store only the submitted settings', async () => {
    await callHandler({ privateMessagesPrivacy: 'only_friends' })

    expect(settings.updateUserSettings).toHaveBeenCalledWith(USER_ADDRESS, {
      private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
    })
  })

  it('should respond with every stored setting', async () => {
    await expect(callHandler({ showSituationReactions: 'hide' })).resolves.toEqual({
      status: 200,
      body: {
        data: {
          privateMessagesPrivacy: 'only_friends',
          blockedUsersMessagesVisibility: 'do_not_show_messages',
          showSituationReactions: 'hide'
        }
      }
    })
  })

  describe('and Gatekeeper cannot be updated', () => {
    let error: Error

    beforeEach(() => {
      error = new Error('gatekeeper down')
      settings.updateUserSettings.mockRejectedValue(error)
    })

    it('should propagate the error instead of reporting a false success', async () => {
      await expect(callHandler({ privateMessagesPrivacy: 'only_friends' })).rejects.toBe(error)
    })
  })
})

describe('when getting the private messages settings of other users', () => {
  function callHandler(query: string) {
    return getPrivateMessagesSettingsHandler({
      components: { settings, logs },
      url: new URL(`http://localhost/v1/private-messages-settings${query}`),
      verification: { auth: USER_ADDRESS } as any
    })
  }

  describe('and the addresses are valid', () => {
    beforeEach(() => {
      settings.getPrivateMessagesSettings.mockResolvedValue([
        { address: OTHER_ADDRESS, privateMessagesPrivacy: PrivateMessagesPrivacy.ALL, isFriend: true }
      ])
    })

    it('should respond with the settings of each address', async () => {
      await expect(callHandler(`?addresses=${OTHER_ADDRESS}`)).resolves.toEqual({
        status: 200,
        body: { data: [{ address: OTHER_ADDRESS, privateMessagesPrivacy: 'all', isFriend: true }] }
      })
    })

    it('should look up the normalized addresses for the caller', async () => {
      await callHandler(`?addresses=${OTHER_ADDRESS.toUpperCase().replace('0X', '0x')}`)

      expect(settings.getPrivateMessagesSettings).toHaveBeenCalledWith(USER_ADDRESS, [OTHER_ADDRESS])
    })
  })

  describe('and no address is requested', () => {
    beforeEach(() => {
      settings.getPrivateMessagesSettings.mockResolvedValue([])
    })

    it('should respond with an empty list', async () => {
      await expect(callHandler('')).resolves.toEqual({ status: 200, body: { data: [] } })
    })
  })

  describe('and one of the addresses is not valid', () => {
    it('should throw an InvalidRequestError without querying', async () => {
      await expect(callHandler(`?addresses=${OTHER_ADDRESS}&addresses=0x123`)).rejects.toThrow(InvalidRequestError)
      expect(settings.getPrivateMessagesSettings).not.toHaveBeenCalled()
    })
  })

  describe('and more than 50 addresses are requested', () => {
    it('should throw an InvalidRequestError without querying', async () => {
      const query = '?' + Array.from({ length: 51 }, () => `addresses=${OTHER_ADDRESS}`).join('&')

      await expect(callHandler(query)).rejects.toThrow(InvalidRequestError)
      expect(settings.getPrivateMessagesSettings).not.toHaveBeenCalled()
    })
  })
})

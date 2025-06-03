import { ILoggerComponent } from '@well-known-components/interfaces'
import { createVoiceComponent, IVoiceComponent } from '../../../src/logic/voice'
import {
  UserAlreadyInVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatNotAllowedError,
  VoiceChatNotFoundError
} from '../../../src/logic/voice/errors'
import { createFriendsDBMockedComponent, createMockedPubSubComponent } from '../../mocks/components'
import { createVoiceDBMockedComponent } from '../../mocks/components/voice-db'
import {
  BlockedUsersMessagesVisibilitySetting,
  ICommsGatekeeperComponent,
  IFriendsDatabaseComponent,
  IPubSubComponent,
  IVoiceDatabaseComponent,
  PrivateMessagesPrivacy
} from '../../../src/types'
import { createSettingsMockedComponent } from '../../mocks/components/settings'
import { ISettingsComponent } from '../../../src/logic/settings'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { PRIVATE_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'

let voice: IVoiceComponent
let publishInChannelMock: jest.MockedFn<IPubSubComponent['publishInChannel']>
let areUsersBeingCalledOrCallingSomeoneMock: jest.MockedFn<
  IVoiceDatabaseComponent['areUsersBeingCalledOrCallingSomeone']
>
let createPrivateVoiceChatMock: jest.MockedFn<IVoiceDatabaseComponent['createPrivateVoiceChat']>
let getUsersSettingsMock: jest.MockedFn<ISettingsComponent['getUsersSettings']>
let getFriendshipMock: jest.MockedFn<IFriendsDatabaseComponent['getFriendship']>
let isUserInAVoiceChatMock: jest.MockedFn<ICommsGatekeeperComponent['isUserInAVoiceChat']>
let getPrivateVoiceChatMock: jest.MockedFn<IVoiceDatabaseComponent['getPrivateVoiceChat']>

beforeEach(() => {
  getPrivateVoiceChatMock = jest.fn()
  getUsersSettingsMock = jest.fn()
  getFriendshipMock = jest.fn()
  isUserInAVoiceChatMock = jest.fn()
  publishInChannelMock = jest.fn()
  areUsersBeingCalledOrCallingSomeoneMock = jest.fn()
  createPrivateVoiceChatMock = jest.fn()
  const logs: ILoggerComponent = {
    getLogger: () => ({
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      log: () => undefined
    })
  }
  const pubsub = createMockedPubSubComponent({ publishInChannel: publishInChannelMock })
  const voiceDb = createVoiceDBMockedComponent({
    areUsersBeingCalledOrCallingSomeone: areUsersBeingCalledOrCallingSomeoneMock,
    createPrivateVoiceChat: createPrivateVoiceChatMock
  })
  const settings = createSettingsMockedComponent({
    getUsersSettings: getUsersSettingsMock
  })
  const friendsDb = createFriendsDBMockedComponent({
    getFriendship: getFriendshipMock
  })
  const commsGatekeeper = createCommsGatekeeperMockedComponent({
    isUserInAVoiceChat: isUserInAVoiceChatMock
  })

  voice = createVoiceComponent({
    logs,
    pubsub,
    voiceDb,
    friendsDb,
    settings,
    commsGatekeeper
  })
})

describe('when starting a private voice chat', () => {
  let callerAddress: string
  let calleeAddress: string

  beforeEach(() => {
    callerAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    calleeAddress = '0x2B72b8d597c553b3173bca922B9ad871da751dA5'
  })

  describe('and the caller is not accepting voice calls from users that are not friends', () => {
    beforeEach(() => {
      getUsersSettingsMock.mockResolvedValueOnce([
        {
          address: callerAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        },
        {
          address: calleeAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        }
      ])
    })

    describe('and the callee is not his friend', () => {
      beforeEach(() => {
        getFriendshipMock.mockResolvedValueOnce({
          id: '1',
          address_requester: callerAddress,
          address_requested: calleeAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: false
        })
      })
      it('should reject with a voice chat not allowed error', () => {
        return expect(voice.startPrivateVoiceChat(callerAddress, calleeAddress)).rejects.toThrow(
          VoiceChatNotAllowedError
        )
      })
    })

    describe('and the callee is his friend', () => {
      beforeEach(() => {
        getFriendshipMock.mockResolvedValueOnce({
          id: '1',
          address_requester: callerAddress,
          address_requested: calleeAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true
        })
        areUsersBeingCalledOrCallingSomeoneMock.mockResolvedValueOnce(false)
        isUserInAVoiceChatMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
      })

      it('should continue with the voice chat creation', async () => {
        await voice.startPrivateVoiceChat(callerAddress, calleeAddress)
        expect(createPrivateVoiceChatMock).toHaveBeenCalledWith(callerAddress, calleeAddress)
      })
    })
  })

  describe('and the callee is not accepting voice calls from users that are not friends', () => {
    beforeEach(() => {
      getUsersSettingsMock.mockResolvedValueOnce([
        {
          address: callerAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        },
        {
          address: calleeAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        }
      ])
    })

    describe('and the caller is not his friend', () => {
      beforeEach(() => {
        getFriendshipMock.mockResolvedValueOnce({
          id: '1',
          address_requester: callerAddress,
          address_requested: calleeAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: false
        })
      })

      it('should reject with a voice chat not allowed error', () => {
        return expect(voice.startPrivateVoiceChat(callerAddress, calleeAddress)).rejects.toThrow(
          VoiceChatNotAllowedError
        )
      })
    })

    describe('and the caller is his friend', () => {
      beforeEach(() => {
        getFriendshipMock.mockResolvedValueOnce({
          id: '1',
          address_requester: calleeAddress,
          address_requested: callerAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true
        })
        areUsersBeingCalledOrCallingSomeoneMock.mockResolvedValueOnce(false)
        isUserInAVoiceChatMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
      })

      it('should continue with the voice chat creation', async () => {
        await voice.startPrivateVoiceChat(callerAddress, calleeAddress)
        expect(createPrivateVoiceChatMock).toHaveBeenCalledWith(callerAddress, calleeAddress)
      })
    })
  })

  describe('and the callee and the caller have the privacy settings to initiate a voice chat', () => {
    beforeEach(() => {
      getUsersSettingsMock.mockResolvedValueOnce([
        {
          address: callerAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        },
        {
          address: calleeAddress,
          private_messages_privacy: PrivateMessagesPrivacy.ALL,
          blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting.SHOW_MESSAGES
        }
      ])
    })

    describe('and the callee or the caller are calling someone else', () => {
      beforeEach(() => {
        areUsersBeingCalledOrCallingSomeoneMock.mockResolvedValueOnce(true)
      })
      it('should reject with a users are calling someone else error', () => {
        return expect(voice.startPrivateVoiceChat(callerAddress, calleeAddress)).rejects.toThrow(
          UsersAreCallingSomeoneElseError
        )
      })
    })

    describe('and the callee is in a voice chat', () => {
      beforeEach(() => {
        isUserInAVoiceChatMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      })
      it('should reject with a user already in voice chat error', () => {
        return expect(voice.startPrivateVoiceChat(callerAddress, calleeAddress)).rejects.toThrow(
          new UserAlreadyInVoiceChatError(calleeAddress)
        )
      })
    })

    describe('and the caller is in a voice chat', () => {
      beforeEach(() => {
        isUserInAVoiceChatMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      })
      it('should reject with a user already in voice chat error', () => {
        return expect(voice.startPrivateVoiceChat(callerAddress, calleeAddress)).rejects.toThrow(
          new UserAlreadyInVoiceChatError(callerAddress)
        )
      })
    })

    describe('and the callee and the caller are not in a voice chat', () => {
      let callId: string

      beforeEach(() => {
        callId = '1'
        isUserInAVoiceChatMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
        createPrivateVoiceChatMock.mockResolvedValueOnce(callId)
        publishInChannelMock.mockResolvedValueOnce(undefined)
      })

      it('should create a voice chat, publish the intent in the pubsub and resolve with the call id', async () => {
        const callId = await voice.startPrivateVoiceChat(callerAddress, calleeAddress)
        expect(callId).toEqual(callId)
        expect(createPrivateVoiceChatMock).toHaveBeenCalledWith(callerAddress, calleeAddress)
        expect(publishInChannelMock).toHaveBeenCalledWith(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
          callId,
          callerAddress,
          calleeAddress,
          status: 'requested'
        })
      })
    })
  })
})

describe('when accepting a private voice chat', () => {
  let callId: string
  let calleeAddress: string
  let callerAddress: string

  beforeEach(() => {
    callId = '1'
    calleeAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    callerAddress = '0x2B72b8d597c553b3173bca922B9ad871da751dA5'
  })

  describe('and the voice chat is not found', () => {
    beforeEach(() => {
      getPrivateVoiceChatMock.mockResolvedValueOnce(null)
    })

    it('should reject with a voice chat not found error', () => {
      return expect(voice.acceptPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotFoundError)
    })
  })

  describe('and the voice chat is found', () => {})
})

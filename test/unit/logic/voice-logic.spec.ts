import { ILoggerComponent } from '@well-known-components/interfaces'
import { createVoiceComponent, IVoiceComponent } from '../../../src/logic/voice'
import {
  UserAlreadyInVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatExpiredError,
  VoiceChatNotAllowedError,
  VoiceChatNotFoundError,
  IncomingVoiceChatNotFoundError
} from '../../../src/logic/voice/errors'
import { createFriendsDBMockedComponent, createMockedPubSubComponent } from '../../mocks/components'
import { createVoiceDBMockedComponent } from '../../mocks/components/voice-db'
import {
  BlockedUsersMessagesVisibilitySetting,
  ICommsGatekeeperComponent,
  IFriendsDatabaseComponent,
  IPubSubComponent,
  IVoiceDatabaseComponent,
  PrivateMessagesPrivacy,
  PrivateVoiceChat
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
let getPrivateVoiceChatCredentialsMock: jest.MockedFn<ICommsGatekeeperComponent['getPrivateVoiceChatCredentials']>
let getPrivateVoiceChatMock: jest.MockedFn<IVoiceDatabaseComponent['getPrivateVoiceChat']>
let deletePrivateVoiceChatMock: jest.MockedFn<IVoiceDatabaseComponent['deletePrivateVoiceChat']>
let endPrivateVoiceChatMock: jest.MockedFn<ICommsGatekeeperComponent['endPrivateVoiceChat']>
let getPrivateVoiceChatForCalleeAddressMock: jest.MockedFn<
  IVoiceDatabaseComponent['getPrivateVoiceChatForCalleeAddress']
>

beforeEach(() => {
  deletePrivateVoiceChatMock = jest.fn()
  getPrivateVoiceChatMock = jest.fn()
  getUsersSettingsMock = jest.fn()
  getFriendshipMock = jest.fn()
  isUserInAVoiceChatMock = jest.fn()
  publishInChannelMock = jest.fn()
  areUsersBeingCalledOrCallingSomeoneMock = jest.fn()
  createPrivateVoiceChatMock = jest.fn()
  getPrivateVoiceChatCredentialsMock = jest.fn()
  endPrivateVoiceChatMock = jest.fn()
  getPrivateVoiceChatForCalleeAddressMock = jest.fn()
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
    createPrivateVoiceChat: createPrivateVoiceChatMock,
    getPrivateVoiceChat: getPrivateVoiceChatMock,
    deletePrivateVoiceChat: deletePrivateVoiceChatMock,
    getPrivateVoiceChatForCalleeAddress: getPrivateVoiceChatForCalleeAddressMock
  })
  const settings = createSettingsMockedComponent({
    getUsersSettings: getUsersSettingsMock
  })
  const friendsDb = createFriendsDBMockedComponent({
    getFriendship: getFriendshipMock
  })
  const commsGatekeeper = createCommsGatekeeperMockedComponent({
    isUserInAVoiceChat: isUserInAVoiceChatMock,
    getPrivateVoiceChatCredentials: getPrivateVoiceChatCredentialsMock,
    endPrivateVoiceChat: endPrivateVoiceChatMock
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

  describe('and the voice chat is found', () => {
    let privateVoiceChat: PrivateVoiceChat

    beforeEach(() => {
      privateVoiceChat = {
        id: callId,
        caller_address: callerAddress,
        callee_address: calleeAddress,
        expires_at: new Date(Date.now() + 1000),
        created_at: new Date(),
        updated_at: new Date()
      }
      getPrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
    })

    describe('and the accepting callee is not the callee of the voice chat', () => {
      beforeEach(() => {
        privateVoiceChat.callee_address = '0x123'
      })

      it('should reject with a voice chat not allowed error', () => {
        return expect(voice.acceptPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotAllowedError)
      })
    })

    describe('and the voice chat has expired', () => {
      beforeEach(() => {
        privateVoiceChat.expires_at = new Date(Date.now() - 1000000000)
      })

      it('should reject with a voice chat expired error', () => {
        return expect(voice.acceptPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatExpiredError)
      })
    })

    describe('and the voice chat is still valid', () => {
      beforeEach(() => {
        privateVoiceChat.expires_at = new Date(Date.now() + 1000000000)
      })

      describe('and getting the private voice chat credentials fails', () => {
        beforeEach(() => {
          getPrivateVoiceChatCredentialsMock.mockRejectedValueOnce(
            new Error('Failed to get private voice chat credentials')
          )
        })

        it('should reject with the propagated error', () => {
          return expect(voice.acceptPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow()
        })
      })

      describe('and getting the private voice chat credentials succeeds', () => {
        let calleeCredentials: { token: string; url: string }
        let callerCredentials: { token: string; url: string }

        beforeEach(() => {
          calleeCredentials = { token: 'token', url: 'url' }
          callerCredentials = { token: 'another-token', url: 'another-url' }

          getPrivateVoiceChatCredentialsMock.mockResolvedValueOnce({
            [calleeAddress]: calleeCredentials,
            [callerAddress]: callerCredentials
          })
        })

        describe('and the voice chat is successfully deleted from the database', () => {
          beforeEach(() => {
            deletePrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
          })

          it('should publish the voice chat accepted event in the channel, delete the voice chat from the database and resolve with the credentials', async () => {
            const result = await voice.acceptPrivateVoiceChat(callId, calleeAddress)
            expect(publishInChannelMock).toHaveBeenCalledWith(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
              callId,
              callerAddress,
              calleeAddress,
              status: 'accepted',
              credentials: {
                token: callerCredentials.token,
                url: callerCredentials.url
              }
            })
            expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
            expect(result).toEqual({
              token: calleeCredentials.token,
              url: calleeCredentials.url
            })
          })
        })

        describe('and the voice chat deletion fails due to race condition', () => {
          beforeEach(() => {
            deletePrivateVoiceChatMock.mockResolvedValueOnce(null)
          })

          it('should end the private voice chat and reject with a voice chat not found error', async () => {
            await expect(voice.acceptPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotFoundError)
            expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, calleeAddress)
            expect(publishInChannelMock).not.toHaveBeenCalled()
          })
        })
      })
    })
  })
})

describe('when rejecting a private voice chat', () => {
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
      return expect(voice.rejectPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotFoundError)
    })
  })

  describe('and the voice chat is found', () => {
    let privateVoiceChat: PrivateVoiceChat

    beforeEach(() => {
      privateVoiceChat = {
        id: callId,
        caller_address: callerAddress,
        callee_address: calleeAddress,
        expires_at: new Date(Date.now() + 1000000000),
        created_at: new Date(),
        updated_at: new Date()
      }
      getPrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
    })

    describe('and the rejecting callee is not the callee of the voice chat', () => {
      beforeEach(() => {
        privateVoiceChat.callee_address = '0x123'
      })

      it('should reject with a voice chat not found error', () => {
        return expect(voice.rejectPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotFoundError)
      })
    })

    describe('and the voice chat has expired', () => {
      beforeEach(() => {
        privateVoiceChat.expires_at = new Date(Date.now() - 1000000000)
      })

      it('should reject with a voice chat expired error', () => {
        return expect(voice.rejectPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatExpiredError)
      })
    })

    describe('and the voice chat is still valid', () => {
      beforeEach(() => {
        privateVoiceChat.expires_at = new Date(Date.now() + 1000000000)
      })

      describe('and the voice chat is successfully deleted from the database', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
        })

        it('should publish the voice chat rejected event in the channel and delete the voice chat from the database', async () => {
          await voice.rejectPrivateVoiceChat(callId, calleeAddress)
          expect(publishInChannelMock).toHaveBeenCalledWith(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
            callId,
            callerAddress,
            calleeAddress,
            status: 'rejected'
          })
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
        })
      })

      describe('and the voice chat deletion fails due to race condition', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(null)
        })

        it('should not publish the voice chat rejected event and reject with a voice chat not found error', async () => {
          await expect(voice.rejectPrivateVoiceChat(callId, calleeAddress)).rejects.toThrow(VoiceChatNotFoundError)
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
          expect(publishInChannelMock).not.toHaveBeenCalled()
        })
      })
    })
  })
})

describe('when ending a private voice chat', () => {
  let callId: string
  let calleeAddress: string
  let callerAddress: string

  beforeEach(() => {
    callId = '1'
    calleeAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    callerAddress = '0x2B72b8d597c553b3173bca922B9ad871da751dA5'
  })

  describe('and the voice chat is not found in the database', () => {
    beforeEach(() => {
      getPrivateVoiceChatMock.mockResolvedValueOnce(null)
    })

    it('should call comms gatekeeper to end the voice chat', async () => {
      await voice.endPrivateVoiceChat(callId, calleeAddress)
      expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, calleeAddress)
      expect(publishInChannelMock).not.toHaveBeenCalled()
      expect(deletePrivateVoiceChatMock).not.toHaveBeenCalled()
    })
  })

  describe('and the voice chat is found in the database', () => {
    let privateVoiceChat: PrivateVoiceChat

    beforeEach(() => {
      privateVoiceChat = {
        id: callId,
        caller_address: callerAddress,
        callee_address: calleeAddress,
        expires_at: new Date(Date.now() + 1000000000),
        created_at: new Date(),
        updated_at: new Date()
      }
      getPrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
    })

    describe('and the address ending the call is neither the caller nor the callee', () => {
      let unknownAddress: string

      beforeEach(() => {
        unknownAddress = '0x123456789'
      })

      it('should reject with a voice chat not found error and not end the voice chat', async () => {
        await expect(voice.endPrivateVoiceChat(callId, unknownAddress)).rejects.toThrow(VoiceChatNotFoundError)
        expect(deletePrivateVoiceChatMock).not.toHaveBeenCalled()
        expect(publishInChannelMock).not.toHaveBeenCalled()
        expect(endPrivateVoiceChatMock).not.toHaveBeenCalled()
      })
    })

    describe('and the callee is ending the call', () => {
      describe('and the voice chat is successfully deleted from the database', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
        })

        it('should delete the voice chat, publish the ended event with callee address undefined, and call the comms gatekeeper', async () => {
          await voice.endPrivateVoiceChat(callId, calleeAddress)
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
          expect(publishInChannelMock).toHaveBeenCalledWith(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
            callId,
            callerAddress,
            calleeAddress: undefined,
            status: 'ended'
          })
          expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, calleeAddress)
        })
      })

      describe('and the voice chat deletion fails due to race condition', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(null)
        })

        it('should not publish the ended event but still call the comms gatekeeper', async () => {
          await voice.endPrivateVoiceChat(callId, calleeAddress)
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
          expect(publishInChannelMock).not.toHaveBeenCalled()
          expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, calleeAddress)
        })
      })
    })

    describe('and the caller is ending the call', () => {
      describe('and the voice chat is successfully deleted from the database', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(privateVoiceChat)
        })

        it('should delete the voice chat, publish the ended event with caller address undefined, and call the comms gatekeeper', async () => {
          await voice.endPrivateVoiceChat(callId, callerAddress)
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
          expect(publishInChannelMock).toHaveBeenCalledWith(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
            callId,
            callerAddress: undefined,
            calleeAddress,
            status: 'ended'
          })
          expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, callerAddress)
        })
      })

      describe('and the voice chat deletion fails due to race condition', () => {
        beforeEach(() => {
          deletePrivateVoiceChatMock.mockResolvedValueOnce(null)
        })

        it('should not publish the ended event but still call the comms gatekeeper', async () => {
          await voice.endPrivateVoiceChat(callId, callerAddress)
          expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(callId)
          expect(publishInChannelMock).not.toHaveBeenCalled()
          expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, callerAddress)
        })
      })
    })
  })
})

describe('when getting the incoming private voice chat', () => {
  let calleeAddress: string

  beforeEach(() => {
    calleeAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
  })

  describe('and no voice chat is found for the callee address', () => {
    beforeEach(() => {
      getPrivateVoiceChatForCalleeAddressMock.mockResolvedValueOnce(null)
    })

    it('should reject with an incoming voice chat not found error', async () => {
      await expect(voice.getIncomingPrivateVoiceChat(calleeAddress)).rejects.toThrow(
        new IncomingVoiceChatNotFoundError(calleeAddress)
      )
    })
  })

  describe('and a voice chat is found for the callee address', () => {
    let privateVoiceChat: PrivateVoiceChat

    beforeEach(() => {
      privateVoiceChat = {
        id: '1',
        caller_address: '0x2B72b8d597c553b3173bca922B9ad871da751dA5',
        callee_address: calleeAddress,
        expires_at: new Date(Date.now() + 1000000000),
        created_at: new Date(),
        updated_at: new Date()
      }
      getPrivateVoiceChatForCalleeAddressMock.mockResolvedValueOnce(privateVoiceChat)
    })

    it('should resolve with the private voice chat', async () => {
      const result = await voice.getIncomingPrivateVoiceChat(calleeAddress)
      expect(result).toEqual(privateVoiceChat)
      expect(getPrivateVoiceChatForCalleeAddressMock).toHaveBeenCalledWith(calleeAddress)
    })
  })
})

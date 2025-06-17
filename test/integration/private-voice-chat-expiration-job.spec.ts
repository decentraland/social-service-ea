import { randomUUID } from 'crypto'
import { test } from '../components'
import { createVoiceDbHelper } from '../helpers/voice-db-helper'
import { generateRandomWalletAddresses } from '../mocks/wallet'

test('Private voice chat expiration', ({ components }) => {
  const halfAnHourInMilliseconds = 1000 * 60 * 30
  let batchSizeOfPrivateVoiceChats: number
  let expirationTimeInMilliseconds: number
  let voiceDbHelper: ReturnType<typeof createVoiceDbHelper>
  let callerAddresses: string[]
  let calleeAddresses: string[]

  beforeEach(async () => {
    voiceDbHelper = createVoiceDbHelper(components.pg)
    batchSizeOfPrivateVoiceChats = await components.config.requireNumber('PRIVATE_VOICE_CHAT_EXPIRATION_BATCH_SIZE')
    expirationTimeInMilliseconds = await components.config.requireNumber('PRIVATE_VOICE_CHAT_EXPIRATION_TIME')
  })

  describe(`when there are less than the batch size of private chats that have been started for longer than the expiration time`, () => {
    let privateVoiceChatIds: string[]

    beforeEach(async () => {
      const now = Date.now()
      privateVoiceChatIds = Array.from({ length: batchSizeOfPrivateVoiceChats - 1 }, () => randomUUID())
      callerAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats - 1)
      calleeAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats - 1)

      for (let i = 0; i < batchSizeOfPrivateVoiceChats - 1; i++) {
        await voiceDbHelper.createPrivateVoiceChat({
          id: privateVoiceChatIds[i],
          caller_address: callerAddresses[i],
          callee_address: calleeAddresses[i],
          created_at: new Date(now - expirationTimeInMilliseconds - 2)
        })
      }
    })

    afterEach(async () => {
      for (const privateVoiceChatId of privateVoiceChatIds) {
        await components.voiceDb.deletePrivateVoiceChat(privateVoiceChatId)
      }
    })

    it('should remove the private voice chats that have been started for longer than the expiration time and resolve', async () => {
      await components.voice.expirePrivateVoiceChat()

      for (const privateVoiceChatId of privateVoiceChatIds) {
        const privateVoiceChat = await components.voiceDb.getPrivateVoiceChat(privateVoiceChatId)
        expect(privateVoiceChat).toBeNull()
      }
    })
  })

  describe('when there are more than the batch size of private chats that have been started for longer than the expiration time', () => {
    let privateVoiceChatIds: string[]

    beforeEach(async () => {
      const now = Date.now()
      privateVoiceChatIds = Array.from({ length: batchSizeOfPrivateVoiceChats + 1 }, () => randomUUID())
      callerAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats + 1)
      calleeAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats + 1)

      for (let i = 0; i < batchSizeOfPrivateVoiceChats + 1; i++) {
        await voiceDbHelper.createPrivateVoiceChat({
          id: privateVoiceChatIds[i],
          caller_address: callerAddresses[i],
          callee_address: calleeAddresses[i],
          created_at: new Date(now - expirationTimeInMilliseconds - 1)
        })
      }
    })

    afterEach(async () => {
      for (const privateVoiceChatId of privateVoiceChatIds) {
        await components.voiceDb.deletePrivateVoiceChat(privateVoiceChatId)
      }
    })

    it('should remove the private voice chats that have been started for longer than the expiration time and resolve', async () => {
      await components.voice.expirePrivateVoiceChat()

      for (const privateVoiceChatId of privateVoiceChatIds) {
        const privateVoiceChat = await components.voiceDb.getPrivateVoiceChat(privateVoiceChatId)
        expect(privateVoiceChat).toBeNull()
      }
    })
  })

  describe('when there are no private chats that have been started for longer than the expiration time', () => {
    let privateVoiceChatIds: string[]

    beforeEach(async () => {
      const now = Date.now()
      privateVoiceChatIds = Array.from({ length: batchSizeOfPrivateVoiceChats }, () => randomUUID())
      callerAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats)
      calleeAddresses = generateRandomWalletAddresses(batchSizeOfPrivateVoiceChats)

      for (let i = 0; i < batchSizeOfPrivateVoiceChats; i++) {
        await voiceDbHelper.createPrivateVoiceChat({
          id: privateVoiceChatIds[i],
          caller_address: callerAddresses[i],
          callee_address: calleeAddresses[i],
          created_at: new Date(now + expirationTimeInMilliseconds + halfAnHourInMilliseconds)
        })
      }
    })

    afterEach(async () => {
      for (const privateVoiceChatId of privateVoiceChatIds) {
        await components.voiceDb.deletePrivateVoiceChat(privateVoiceChatId)
      }
    })

    it('should not remove the private voice chats that have not expired and resolve', async () => {
      await components.voice.expirePrivateVoiceChat()

      for (const privateVoiceChatId of privateVoiceChatIds) {
        const privateVoiceChat = await components.voiceDb.getPrivateVoiceChat(privateVoiceChatId)
        expect(privateVoiceChat).not.toBeNull()
      }
    })
  })
})

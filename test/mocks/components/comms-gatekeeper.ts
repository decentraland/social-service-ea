import { ICommsGatekeeperComponent } from '../../../src/types'

export function createCommsGatekeeperMockedComponent({
  isUserInAVoiceChat = jest.fn(),
  updateUserPrivateMessagePrivacyMetadata = jest.fn(),
  getPrivateVoiceChatCredentials = jest.fn(),
  endPrivateVoiceChat = jest.fn()
}: Partial<jest.Mocked<ICommsGatekeeperComponent>>): jest.Mocked<ICommsGatekeeperComponent> {
  return {
    getPrivateVoiceChatCredentials,
    isUserInAVoiceChat,
    updateUserPrivateMessagePrivacyMetadata,
    endPrivateVoiceChat
  }
}

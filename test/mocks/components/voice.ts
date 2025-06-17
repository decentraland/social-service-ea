import { IVoiceComponent } from '../../../src/logic/voice'

export function createVoiceMockedComponent({
  startPrivateVoiceChat = jest.fn(),
  acceptPrivateVoiceChat = jest.fn(),
  rejectPrivateVoiceChat = jest.fn(),
  endPrivateVoiceChat = jest.fn(),
  getIncomingPrivateVoiceChat = jest.fn(),
  endIncomingOrOutgoingPrivateVoiceChatForUser = jest.fn(),
  expirePrivateVoiceChat = jest.fn()
}: Partial<jest.Mocked<IVoiceComponent>>): jest.Mocked<IVoiceComponent> {
  return {
    expirePrivateVoiceChat,
    startPrivateVoiceChat,
    acceptPrivateVoiceChat,
    rejectPrivateVoiceChat,
    endPrivateVoiceChat,
    getIncomingPrivateVoiceChat,
    endIncomingOrOutgoingPrivateVoiceChatForUser
  }
}

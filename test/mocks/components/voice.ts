import { IVoiceComponent } from '../../../src/logic/voice'

export function createVoiceMockedComponent({
  startPrivateVoiceChat = jest.fn(),
  acceptPrivateVoiceChat = jest.fn(),
  rejectPrivateVoiceChat = jest.fn(),
  endPrivateVoiceChat = jest.fn(),
  getIncomingPrivateVoiceChat = jest.fn()
}: Partial<jest.Mocked<IVoiceComponent>>): jest.Mocked<IVoiceComponent> {
  return {
    startPrivateVoiceChat,
    acceptPrivateVoiceChat,
    rejectPrivateVoiceChat,
    endPrivateVoiceChat,
    getIncomingPrivateVoiceChat
  }
}

import { IVoiceComponent } from '../../../src/logic/voice'

export function createVoiceMockedComponent({
  startPrivateVoiceChat = jest.fn()
}: Partial<jest.Mocked<IVoiceComponent>>): jest.Mocked<IVoiceComponent> {
  return {
    startPrivateVoiceChat
  }
}

import { IVoiceComponent } from '../../../src/logic/voice'

export function createVoiceMockedComponent({
  startVoiceChat = jest.fn()
}: Partial<jest.Mocked<IVoiceComponent>>): jest.Mocked<IVoiceComponent> {
  return {
    startVoiceChat
  }
}

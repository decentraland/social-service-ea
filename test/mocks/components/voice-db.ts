import { IVoiceDatabaseComponent } from '../../../src/types'

export function createVoiceDBMockedComponent({
  areUsersBeingCalledOrCallingSomeone = jest.fn(),
  createPrivateVoiceChat = jest.fn(),
  getPrivateVoiceChat = jest.fn(),
  deletePrivateVoiceChat = jest.fn(),
  getPrivateVoiceChatForCalleeAddress = jest.fn(),
  getPrivateVoiceChatOfUser = jest.fn()
}: Partial<jest.Mocked<IVoiceDatabaseComponent>>): jest.Mocked<IVoiceDatabaseComponent> {
  return {
    areUsersBeingCalledOrCallingSomeone,
    createPrivateVoiceChat,
    getPrivateVoiceChat,
    deletePrivateVoiceChat,
    getPrivateVoiceChatForCalleeAddress,
    getPrivateVoiceChatOfUser
  }
}

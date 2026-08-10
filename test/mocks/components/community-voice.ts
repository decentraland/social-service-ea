import { ICommunityVoiceComponent } from '../../../src/logic/community-voice'

export function createCommunityVoiceMockedComponent({
  startCommunityVoiceChat = jest.fn(),
  joinCommunityVoiceChat = jest.fn(),
  requestToSpeakInCommunityVoiceChat = jest.fn(),
  muteSpeakerInCommunityVoiceChat = jest.fn(),
  getCommunityVoiceChat = jest.fn(),
  getActiveCommunityVoiceChats = jest.fn(),
  getActiveCommunityVoiceChatsForUser = jest.fn(),
  endCommunityVoiceChat = jest.fn()
}: Partial<jest.Mocked<ICommunityVoiceComponent>>): jest.Mocked<ICommunityVoiceComponent> {
  return {
    startCommunityVoiceChat,
    joinCommunityVoiceChat,
    requestToSpeakInCommunityVoiceChat,
    muteSpeakerInCommunityVoiceChat,
    getCommunityVoiceChat,
    getActiveCommunityVoiceChats,
    getActiveCommunityVoiceChatsForUser,
    endCommunityVoiceChat
  }
}

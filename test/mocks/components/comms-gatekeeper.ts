import { ICommsGatekeeperComponent } from '../../../src/types'

export function createCommsGatekeeperMockedComponent({
  getPrivateVoiceChatCredentials = jest.fn(),
  isUserInAVoiceChat = jest.fn(),
  updateUserPrivateMessagePrivacyMetadata = jest.fn(),
  endPrivateVoiceChat = jest.fn(),
  getCommunityVoiceChatCredentials = jest.fn(),
  createCommunityVoiceChatRoom = jest.fn(),
  endCommunityVoiceChatRoom = jest.fn(),
  updateUserMetadataInCommunityVoiceChat = jest.fn(),
  requestToSpeakInCommunityVoiceChat = jest.fn(),
  rejectSpeakRequestInCommunityVoiceChat = jest.fn(),
  promoteSpeakerInCommunityVoiceChat = jest.fn(),
  demoteSpeakerInCommunityVoiceChat = jest.fn(),
  getCommunityVoiceChatStatus = jest.fn(),
  getCommunitiesVoiceChatStatus = jest.fn(),
  getAllActiveCommunityVoiceChats = jest.fn(),
  kickUserFromCommunityVoiceChat = jest.fn()
}: Partial<jest.Mocked<ICommsGatekeeperComponent>>): jest.Mocked<ICommsGatekeeperComponent> {
  return {
    getPrivateVoiceChatCredentials,
    isUserInAVoiceChat,
    updateUserPrivateMessagePrivacyMetadata,
    endPrivateVoiceChat,
    getCommunityVoiceChatCredentials,
    createCommunityVoiceChatRoom,
    endCommunityVoiceChatRoom,
    updateUserMetadataInCommunityVoiceChat,
    requestToSpeakInCommunityVoiceChat,
    rejectSpeakRequestInCommunityVoiceChat,
    promoteSpeakerInCommunityVoiceChat,
    demoteSpeakerInCommunityVoiceChat,
    getCommunityVoiceChatStatus,
    getCommunitiesVoiceChatStatus,
    getAllActiveCommunityVoiceChats,
    kickUserFromCommunityVoiceChat
  }
}

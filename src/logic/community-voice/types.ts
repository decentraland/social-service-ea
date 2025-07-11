import { CommunityVoiceChat, CommunityVoiceChatParticipant } from '../../types'

export interface ICommunityVoiceComponent {
  // Community voice chat management
  startCommunityVoiceChat(communityId: string, creatorAddress: string): Promise<{ connectionUrl: string }>
  endCommunityVoiceChat(voiceChatId: string, userAddress: string): Promise<void>

  // Participant management
  joinCommunityVoiceChat(communityId: string, userAddress: string): Promise<{ connectionUrl: string }>
  leaveCommunityVoiceChat(voiceChatId: string, userAddress: string): Promise<void>

  // Queries
  getCommunityVoiceChat(communityId: string): Promise<CommunityVoiceChat | null>
  getCommunityVoiceChatParticipants(voiceChatId: string): Promise<CommunityVoiceChatParticipant[]>
  getActiveCommunityVoiceChats(): Promise<CommunityVoiceChat[]>
}

import { CommunityVoiceChat, CommunityVoiceChatParticipant } from '../../types'

export interface ICommunityVoiceComponent {
  // Community voice chat management
  startCommunityVoiceChat(communityId: string, creatorAddress: string): Promise<{ connectionUrl: string }>

  // Participant management
  joinCommunityVoiceChat(communityId: string, userAddress: string): Promise<{ connectionUrl: string }>

  // Queries
  getCommunityVoiceChat(communityId: string): Promise<CommunityVoiceChat | null>
  getCommunityVoiceChatParticipants(communityId: string): Promise<CommunityVoiceChatParticipant[]>
  getActiveCommunityVoiceChats(): Promise<CommunityVoiceChat[]>
}

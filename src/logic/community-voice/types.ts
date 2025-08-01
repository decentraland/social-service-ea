import { CommunityVoiceChat } from '../../types'
import { ActiveCommunityVoiceChat } from '../community/types'

export interface ICommunityVoiceComponent {
  // Community voice chat management
  startCommunityVoiceChat(communityId: string, creatorAddress: string): Promise<{ connectionUrl: string }>

  // Participant management
  joinCommunityVoiceChat(communityId: string, userAddress: string): Promise<{ connectionUrl: string }>

  // Queries
  getCommunityVoiceChat(communityId: string): Promise<CommunityVoiceChat | null>
  getActiveCommunityVoiceChats(): Promise<CommunityVoiceChat[]>
  getActiveCommunityVoiceChatsForUser(userAddress: string): Promise<ActiveCommunityVoiceChat[]>
}

export enum CommunityVoiceChatAction {
  CREATE = 'create',
  JOIN = 'join'
}

export interface CommunityVoiceChatProfileData {
  name: string
  has_claimed_name: boolean
  profile_picture_url: string
}

export interface CommunityVoiceChatRequest {
  community_id: string
  user_address: string
  action: CommunityVoiceChatAction
}

export interface CommunityVoiceChatResponse {
  connection_url: string
}

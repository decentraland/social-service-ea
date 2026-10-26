import { CommunityVoiceChat } from '../../types'
import { ActiveCommunityVoiceChat } from '../community/types'

/** Optional profile enrichment for legacy RPC callers; HTTP callers disable it. */
export type CommunityVoiceChatOptions = { includeProfile?: boolean }

export interface ICommunityVoiceComponent {
  // Community voice chat management
  startCommunityVoiceChat(
    communityId: string,
    creatorAddress: string,
    options?: CommunityVoiceChatOptions
  ): Promise<{ connectionUrl: string }>
  endCommunityVoiceChat(communityId: string, userAddress: string): Promise<void>

  // Participant management
  joinCommunityVoiceChat(
    communityId: string,
    userAddress: string,
    options?: CommunityVoiceChatOptions
  ): Promise<{ connectionUrl: string }>
  requestToSpeakInCommunityVoiceChat(communityId: string, userAddress: string, isRaisingHand: boolean): Promise<void>
  muteSpeakerInCommunityVoiceChat(
    communityId: string,
    targetUserAddress: string,
    actingUserAddress: string,
    muted: boolean
  ): Promise<void>

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

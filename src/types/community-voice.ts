export enum CommunityVoiceChatAction {
  CREATE = 'create',
  JOIN = 'join'
}

export interface CommunityVoiceChatRequest {
  community_id: string
  user_address: string
  action: CommunityVoiceChatAction
}

export interface CommunityVoiceChatResponse {
  connection_url: string
}

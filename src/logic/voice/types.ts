export interface AcceptPrivateVoiceChatResult {
  token: string
  url: string
}

export interface IVoiceComponent {
  startPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string>
  acceptPrivateVoiceChat(callId: string, calleeAddress: string): Promise<AcceptPrivateVoiceChatResult>
  rejectPrivateVoiceChat(callId: string, calleeAddress: string): Promise<void>
}

export enum VoiceChatStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected'
}

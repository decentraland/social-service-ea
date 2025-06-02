export interface IVoiceComponent {
  startVoiceChat(callerAddress: string, calleeAddress: string): Promise<string>
}

export enum VoiceChatStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected'
}

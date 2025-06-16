import { PrivateVoiceChat } from '../../types'

export interface AcceptPrivateVoiceChatResult {
  connectionUrl: string
}

export interface IVoiceComponent {
  startPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string>
  acceptPrivateVoiceChat(callId: string, calleeAddress: string): Promise<AcceptPrivateVoiceChatResult>
  rejectPrivateVoiceChat(callId: string, calleeAddress: string): Promise<void>
  endPrivateVoiceChat(callId: string, address: string): Promise<void>
  endIncomingOrOutgoingPrivateVoiceChatForUser(address: string): Promise<void>
  getIncomingPrivateVoiceChat(address: string): Promise<PrivateVoiceChat>
}

export enum VoiceChatStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  ENDED = 'ended',
  EXPIRED = 'expired'
}

export interface IVoiceComponent {
  startVoiceChat(callerAddress: string, calleeAddress: string): Promise<string>
}

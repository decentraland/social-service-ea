export class VoiceCallNotAllowedError extends Error {
  constructor() {
    super(`The callee or the caller are not accepting voice calls`)
  }
}

export class UsersAlreadyInVoiceChatError extends Error {
  constructor() {
    super(`The callee or the caller are already in a voice chat`)
  }
}

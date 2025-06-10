export class VoiceChatNotAllowedError extends Error {
  constructor() {
    super(`The callee or the caller are not accepting voice calls from users that are not friends`)
  }
}

export class UserAlreadyInVoiceChatError extends Error {
  constructor(address: string) {
    super(`One of the users is already in a voice chat: ${address}`)
  }
}

export class UsersAreCallingSomeoneElseError extends Error {
  constructor() {
    super('One of the users is busy calling someone else')
  }
}

export class VoiceChatExpiredError extends Error {
  constructor(callId: string) {
    super(`The voice chat with id ${callId} has expired`)
  }
}

export class VoiceChatNotFoundError extends Error {
  constructor(callId: string) {
    super(`The voice chat with id ${callId} was not found`)
  }
}

export class IncomingVoiceChatNotFoundError extends Error {
  constructor(address: string) {
    super(`The incoming voice chat for the address ${address} was not found`)
  }
}

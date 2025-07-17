export class CommunityVoiceChatNotFoundError extends Error {
  constructor(communityId: string) {
    super(`Community voice chat not found for community ${communityId}`)
  }
}

export class CommunityVoiceChatAlreadyActiveError extends Error {
  constructor(communityId: string) {
    super(`Community ${communityId} already has an active voice chat`)
  }
}

export class CommunityVoiceChatPermissionError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class CommunityVoiceChatModerationError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class UserNotCommunityMemberError extends Error {
  constructor(userAddress: string, communityId: string) {
    super(`User ${userAddress} is not a member of community ${communityId}`)
  }
}

export class CommunityVoiceChatCreationError extends Error {
  constructor(message: string) {
    super(message)
  }
}

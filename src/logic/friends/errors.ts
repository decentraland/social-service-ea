export class ProfileNotFoundError extends Error {
  constructor(address: string) {
    super(`Profile not found for address ${address}`)
  }
}

export class BlockedUserError extends Error {
  constructor() {
    super('This action is not allowed because either you blocked this user or this user blocked you')
  }
}

export class InvalidFriendshipActionError extends Error {
  constructor(message = 'The friendship action is not valid for the current friendship status') {
    super(message)
  }
}

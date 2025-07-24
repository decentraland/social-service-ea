export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class InvalidFriendshipActionError extends Error {
  constructor(message: string) {
    super(message)
  }
}

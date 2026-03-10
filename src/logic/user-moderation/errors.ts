export class PlayerAlreadyBannedError extends Error {
  constructor(address: string) {
    super(`Player is already banned: ${address}`)
  }
}

export class BanNotFoundError extends Error {
  constructor(address: string) {
    super(`No active ban found for player: ${address}`)
  }
}

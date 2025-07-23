export class ProfileNotFoundError extends Error {
  constructor(address: string) {
    super(`Profile not found for address ${address}`)
  }
}

export class WrongOnTimeError extends Error {
  constructor(onTime: number) {
    super(`onTime must be greater than 500ms, got ${onTime}ms`)
  }
}

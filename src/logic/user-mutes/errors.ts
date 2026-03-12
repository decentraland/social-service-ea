export class SelfMuteError extends Error {
  constructor() {
    super('Cannot mute yourself')
    this.name = 'SelfMuteError'
  }
}

import { NotFoundError } from '@dcl/platform-server-commons'

export class CommunityNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Community not found: ${id}`)
    this.name = 'CommunityNotFoundError'
  }
}

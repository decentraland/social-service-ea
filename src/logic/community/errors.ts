import { NotFoundError } from '@dcl/platform-server-commons'

export class CommunityNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Community not found: ${id}`)
    this.name = 'CommunityNotFoundError'
  }
}

// TODO: also use the errors below in community.ts
export class CommunityMemberNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Community member not found: ${id}`)
    this.name = 'CommunityMemberNotFoundError'
  }
}

export class CommunityPlaceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Community place not found: ${id}`)
    this.name = 'CommunityPlaceNotFoundError'
  }
}

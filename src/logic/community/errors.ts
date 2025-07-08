import { NotFoundError } from '@dcl/platform-server-commons'
import { EthAddress } from '@dcl/schemas'

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

export class CommunityOwnerNotFoundError extends NotFoundError {
  constructor(id: string, ownerAddress: EthAddress) {
    super(`Community owner not found: ${id} - ${ownerAddress}`)
    this.name = 'CommunityOwnerNotFoundError'
  }
}

export class CommunityPlaceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Community place not found: ${id}`)
    this.name = 'CommunityPlaceNotFoundError'
  }
}

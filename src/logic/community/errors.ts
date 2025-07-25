import { EthAddress } from '@dcl/schemas'

export class CommunityNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Community not found: ${id}`)
    this.name = 'CommunityNotFoundError'
  }
}

// TODO: also use the errors below in community.ts
export class CommunityMemberNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Community member not found: ${id}`)
    this.name = 'CommunityMemberNotFoundError'
  }
}

export class CommunityOwnerNotFoundError extends Error {
  constructor(
    public readonly id: string,
    public readonly ownerAddress: EthAddress
  ) {
    super(`Community owner not found: ${id} - ${ownerAddress}`)
    this.name = 'CommunityOwnerNotFoundError'
  }
}

export class CommunityPlaceNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Community place not found: ${id}`)
    this.name = 'CommunityPlaceNotFoundError'
  }
}

import { EthAddress } from '@dcl/schemas'

export class CommunityNotFoundError {
  public readonly message: string
  constructor(public readonly id: string) {
    this.message = `Community not found: ${id}`
  }
}

// TODO: also use the errors below in community.ts
export class CommunityMemberNotFoundError {
  public readonly message: string
  constructor(public readonly id: string) {
    this.message = `Community member not found: ${id}`
  }
}

export class CommunityOwnerNotFoundError {
  public readonly message: string
  constructor(
    public readonly id: string,
    public readonly ownerAddress: EthAddress
  ) {
    this.message = `Community owner not found: ${id} - ${ownerAddress}`
  }
}

export class CommunityPlaceNotFoundError {
  public readonly message: string
  constructor(public readonly id: string) {
    this.message = `Community place not found: ${id}`
  }
}

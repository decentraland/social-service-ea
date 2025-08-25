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

/**
 * This error is thrown when a community request (invite or request to join) is invalid
 *
 * @export
 * @class InvalidCommunityRequestError
 * @extends {Error}
 */
export class InvalidCommunityRequestError extends Error {
  constructor(public readonly message: string) {
    super(message)
    this.name = 'InvalidCommunityRequestError'
  }
}

/**
 * This error is thrown when community content violates Decentraland's Code of Ethics
 *
 * @export
 * @class CommunityNotCompliantError
 * @extends {Error}
 */
export class CommunityNotCompliantError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
    public readonly warnings: string[],
    public readonly confidence: number = 0
  ) {
    super(message)
    this.name = 'CommunityNotCompliantError'
  }
}

/**
 * This error is thrown when the AI compliance validation process fails
 * (e.g., API errors, parsing errors) rather than when content is found to be non-compliant
 *
 * @export
 * @class AIComplianceError
 * @extends {Error}
 */
export class AIComplianceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIComplianceError'
  }
}

/**
 * This error is thrown when AI compliance validation fails and manual review is required
 *
 * @export
 * @class CommunityComplianceManualReviewError
 * @extends {Error}
 */
export class CommunityComplianceManualReviewError extends Error {
  constructor(
    message: string,
    public readonly communityId: string,
    public readonly communityName: string,
    public readonly ownerAddress: string,
    public readonly originalError: Error
  ) {
    super(message)
    this.name = 'CommunityComplianceManualReviewError'
  }
}

/**
 * This error is thrown when a community request (invite or request to join) is not found
 *
 * @export
 * @class CommunityRequestNotFoundError
 * @extends {Error}
 */
export class CommunityRequestNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Community request not found: ${id}`)
    this.name = 'CommunityRequestNotFoundError'
  }
}

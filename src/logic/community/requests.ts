import { PaginatedParameters } from '@dcl/schemas'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError, CommunityRequestNotFoundError, InvalidCommunityRequestError } from './errors'
import {
  CommunityPrivacyEnum,
  MemberRequest,
  CommunityRequestStatus,
  CommunityRequestType,
  ICommunityRequestsComponent,
  MemberCommunityRequest,
  ListCommunityRequestsOptions,
  RequestActionOptions
} from './types'

export function createCommunityRequestsComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'communities' | 'communityRoles' | 'logs'>
): ICommunityRequestsComponent {
  const { communitiesDb, communities, communityRoles, logs } = components

  const logger = logs.getLogger('community-requests-component')

  async function createCommunityRequest(
    communityId: string,
    memberAddress: string,
    type: CommunityRequestType
  ): Promise<MemberRequest> {
    let createdRequest: MemberRequest
    const community = await communitiesDb.getCommunity(communityId, memberAddress)
    if (!community) {
      throw new CommunityNotFoundError(communityId)
    }

    if (community.privacy === CommunityPrivacyEnum.Public && type === CommunityRequestType.RequestToJoin) {
      throw new InvalidCommunityRequestError(`Public communities do not accept requests to join`)
    }

    if (community.role !== CommunityRole.None) {
      throw new InvalidCommunityRequestError(
        `User cannot join since it is already a member of the community: ${community.name}`
      )
    }

    const existingMemberRequests = await communitiesDb.getCommunityRequests(communityId, {
      pagination: { limit: 1, offset: 0 },
      targetAddress: memberAddress,
      status: CommunityRequestStatus.Pending
    })

    const isRequestDuplicated = existingMemberRequests.some((request) => request.type === type)

    if (isRequestDuplicated) {
      throw new InvalidCommunityRequestError(`Request already exists`)
    }

    // if the request is a request to join and there is a invite already pending, we should automatically accept the invite
    const shouldAutomaticallyJoin =
      type === CommunityRequestType.RequestToJoin &&
      existingMemberRequests.some((request) => request.type === CommunityRequestType.Invite)

    if (shouldAutomaticallyJoin) {
      const inviteRequest: MemberRequest = existingMemberRequests.find(
        (request) => request.type === CommunityRequestType.Invite
      )!
      await communitiesDb.acceptCommunityRequestTransaction(inviteRequest.id, {
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })

      createdRequest = {
        ...inviteRequest,
        type: CommunityRequestType.RequestToJoin,
        status: CommunityRequestStatus.Accepted
      }

      logger.info(
        `Automatically joined user ${memberAddress} to community ${community.name} (${communityId}) by accepting invite`
      )
    } else {
      createdRequest = await communitiesDb.createCommunityRequest(communityId, memberAddress, type)
      logger.info(
        `Created community request: ${type} (${createdRequest.id}) for community ${community.name} (${communityId}) for member ${memberAddress}`
      )
    }

    return createdRequest
  }

  async function getMemberRequests(
    memberAddress: string,
    options: { type?: CommunityRequestType; pagination: Required<PaginatedParameters> }
  ): Promise<{ requests: MemberRequest[]; total: number }> {
    const [requests, total] = await Promise.all([
      communitiesDb.getMemberRequests(memberAddress, {
        pagination: options.pagination,
        status: CommunityRequestStatus.Pending,
        type: options?.type
      }),
      communitiesDb.getMemberRequestsCount(memberAddress, {
        status: CommunityRequestStatus.Pending,
        type: options?.type
      })
    ])

    return { requests, total }
  }

  async function getCommunityRequests(
    communityId: string,
    options: ListCommunityRequestsOptions & RequestActionOptions
  ): Promise<{ requests: MemberRequest[]; total: number }> {
    await communityRoles.validatePermissionToViewRequests(communityId, options.callerAddress)

    const [requests, total] = await Promise.all([
      communitiesDb.getCommunityRequests(communityId, {
        pagination: options.pagination,
        status: CommunityRequestStatus.Pending,
        type: options.type
      }),
      communitiesDb.getCommunityRequestsCount(communityId, {
        status: CommunityRequestStatus.Pending,
        type: options.type
      })
    ])

    return { requests, total }
  }

  async function updateRequestStatus(
    requestId: string,
    status: Exclude<CommunityRequestStatus, 'pending'>,
    options: RequestActionOptions
  ): Promise<void> {
    const request = await communitiesDb.getCommunityRequest(requestId)

    if (!request || request.status !== CommunityRequestStatus.Pending) {
      throw new CommunityRequestNotFoundError(requestId)
    }

    if (request.type === CommunityRequestType.Invite) {
      await validateInvitePermissions(request, status, options.callerAddress)
    } else if (request.type === CommunityRequestType.RequestToJoin) {
      await validateJoinPermissions(request, status, options.callerAddress)
    }

    // User accepts invite or member with privileges accepts request to join
    if (status === CommunityRequestStatus.Accepted) {
      await communitiesDb.acceptCommunityRequestTransaction(requestId, {
        communityId: request.communityId,
        memberAddress: request.memberAddress,
        role: CommunityRole.Member
      })

      logger.info('Community request accepted', {
        requestId,
        communityId: request.communityId,
        type: request.type,
        memberAddress: request.memberAddress,
        callerAddress: options.callerAddress
      })
    }

    if (status === CommunityRequestStatus.Rejected || status === CommunityRequestStatus.Cancelled) {
      logger.info('Community request rejected or cancelled', {
        requestId,
        communityId: request.communityId,
        type: request.type,
        memberAddress: request.memberAddress,
        callerAddress: options.callerAddress
      })

      await communitiesDb.removeCommunityRequest(requestId)
    }
  }

  /**
   * Validates permissions for invite actions using early returns to reduce nesting
   */
  async function validateInvitePermissions(
    request: MemberRequest,
    status: Exclude<CommunityRequestStatus, 'pending'>,
    callerAddress: string
  ): Promise<void> {
    if (status === CommunityRequestStatus.Cancelled) {
      if (request.memberAddress === callerAddress) {
        throw new NotAuthorizedError('Invited user cannot cancel their invite')
      }
      await communityRoles.validatePermissionToAcceptAndRejectRequests(request.communityId, callerAddress)
      return
    }

    if (request.memberAddress !== callerAddress) {
      throw new NotAuthorizedError('Only invited user can accept or reject invites')
    }
  }

  /**
   * Validates permissions for join request actions using early returns to reduce nesting
   */
  async function validateJoinPermissions(
    request: MemberRequest,
    status: Exclude<CommunityRequestStatus, 'pending'>,
    callerAddress: string
  ): Promise<void> {
    if (status === CommunityRequestStatus.Cancelled) {
      if (request.memberAddress !== callerAddress) {
        throw new NotAuthorizedError('Only requesting user can cancel their request')
      }
      return
    }

    if (request.memberAddress === callerAddress) {
      throw new NotAuthorizedError('Requesting user cannot accept or reject their own request')
    }

    await communityRoles.validatePermissionToAcceptAndRejectRequests(request.communityId, callerAddress)
  }

  async function aggregateRequestsWithCommunities(
    memberAddress: string,
    requests: MemberRequest[]
  ): Promise<MemberCommunityRequest[]> {
    if (requests.length === 0) {
      return []
    }

    const communityIds = requests.map((request) => request.communityId)
    const { communities: communityData } = await communities.getCommunities(memberAddress, {
      communityIds,
      pagination: { limit: communityIds.length, offset: 0 }
    })

    return requests
      .map((request) => {
        const community = communityData.find((community) => community.id === request.communityId)
        if (!community) {
          logger.warn(`Community ${request.communityId} not found for request ${request.id}`)
          return undefined
        }

        const { id, ...communityWithoutId } = community // prevent id override
        return {
          ...communityWithoutId,
          ...request
        } as MemberCommunityRequest
      })
      .filter(Boolean) as MemberCommunityRequest[]
  }

  return {
    createCommunityRequest,
    getMemberRequests,
    getCommunityRequests,
    updateRequestStatus,
    aggregateRequestsWithCommunities
  }
}

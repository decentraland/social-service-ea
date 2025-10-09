import { Events, PaginatedParameters } from '@dcl/schemas'
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
import { getProfileName } from '../profiles'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function createCommunityRequestsComponent(
  components: Pick<
    AppComponents,
    | 'communitiesDb'
    | 'communities'
    | 'communityRoles'
    | 'communityThumbnail'
    | 'communityBroadcaster'
    | 'catalystClient'
    | 'pubsub'
    | 'logs'
  >
): ICommunityRequestsComponent {
  const {
    communitiesDb,
    communities,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    catalystClient,
    pubsub,
    logs
  } = components

  const logger = logs.getLogger('community-requests-component')

  async function notifyStakeholdersAboutRequest(
    request: MemberRequest,
    {
      communityId,
      communityName,
      memberAddress,
      memberName
    }: { communityId: string; communityName: string; memberAddress: string; memberName?: string }
  ) {
    if (request.type === CommunityRequestType.RequestToJoin) {
      if (request.status === CommunityRequestStatus.Pending) {
        await communityBroadcaster.broadcast({
          type: Events.Type.COMMUNITY,
          subType: Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED,
          key: `community-request-to-join-received-${communityId}-${request.id}`,
          timestamp: Date.now(),
          metadata: {
            communityId: communityId,
            communityName: communityName,
            memberAddress,
            memberName: memberName || 'Unknown',
            thumbnailUrl: communityThumbnail.buildThumbnailUrl(communityId)
          }
        })
      } else if (request.status === CommunityRequestStatus.Accepted) {
        await communityBroadcaster.broadcast({
          type: Events.Type.COMMUNITY,
          subType: Events.SubType.Community.REQUEST_TO_JOIN_ACCEPTED,
          key: `community-request-to-join-accepted-${communityId}-${request.id}`,
          timestamp: Date.now(),
          metadata: {
            communityId: communityId,
            communityName: communityName,
            memberAddress,
            thumbnailUrl: communityThumbnail.buildThumbnailUrl(communityId)
          }
        })
      }
    } else if (request.type === CommunityRequestType.Invite && request.status === CommunityRequestStatus.Pending) {
      await communityBroadcaster.broadcast({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.INVITE_RECEIVED,
        key: `community-invite-received-${communityId}-${request.id}`,
        timestamp: Date.now(),
        metadata: {
          communityId: communityId,
          communityName: communityName,
          memberAddress,
          thumbnailUrl: communityThumbnail.buildThumbnailUrl(communityId)
        }
      })
    }
  }

  async function createCommunityRequest(
    communityId: string,
    memberAddress: string,
    type: CommunityRequestType,
    callerAddress: string
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
        `User cannot join since it is already a member of the community: ${community.name} (${community.id})`
      )
    }

    if (type === CommunityRequestType.Invite) {
      await communityRoles.validatePermissionToInviteUsers(communityId, callerAddress)
    } else if (memberAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new InvalidCommunityRequestError(`User trying to impersonate another user`)
    }

    const existingMemberRequests = await communitiesDb.getCommunityRequests(communityId, {
      pagination: { limit: 2, offset: 0 }, // An user can have maximum 2 requests at the same time for a given community
      targetAddress: memberAddress,
      status: CommunityRequestStatus.Pending
    })

    const duplicatedRequest = existingMemberRequests.find((request) => request.type === type)

    // Do not fail if the request is duplicated, just return it
    if (duplicatedRequest) {
      return duplicatedRequest
    }

    // Check for automatic join scenarios - if there's a request of the opposite type, auto-accept it
    const oppositeTypeRequest = existingMemberRequests.find((request) => request.type !== type)

    if (oppositeTypeRequest) {
      await communitiesDb.joinMemberAndRemoveRequests({
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })

      createdRequest = {
        ...oppositeTypeRequest,
        type,
        status: CommunityRequestStatus.Accepted
      }

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress,
        status: ConnectivityStatus.ONLINE
      })

      logger.info(
        `Automatically joined user ${memberAddress} to community ${community.name} (${communityId}) by accepting ${oppositeTypeRequest.type}`
      )
    } else {
      createdRequest = await communitiesDb.createCommunityRequest(communityId, memberAddress, type)
      logger.info(
        `Created community request: ${type} (${createdRequest.id}) for community ${community.name} (${communityId}) for member ${memberAddress}`
      )
    }

    setImmediate(async () => {
      let memberName: string | undefined

      try {
        if (
          createdRequest.type === CommunityRequestType.RequestToJoin &&
          createdRequest.status === CommunityRequestStatus.Pending
        ) {
          const memberProfile = await catalystClient.getProfile(createdRequest.memberAddress)
          memberName = getProfileName(memberProfile)
        }
      } catch (error) {
        logger.warn(`Failed to fetch profile for member ${createdRequest.memberAddress}: ${error}`)
      }

      await notifyStakeholdersAboutRequest(createdRequest, {
        communityId,
        communityName: community.name,
        memberAddress,
        memberName
      })
    })

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

    const community = await communitiesDb.getCommunity(request.communityId, request.memberAddress)

    if (!community) {
      throw new CommunityNotFoundError(request.communityId)
    }

    if (request.type === CommunityRequestType.Invite) {
      await validateInvitePermissions(request, status, options.callerAddress)
    } else if (request.type === CommunityRequestType.RequestToJoin) {
      await validateJoinPermissions(request, status, options.callerAddress)
    }

    // User accepts invite or member with privileges accepts request to join
    if (status === CommunityRequestStatus.Accepted) {
      await communitiesDb.joinMemberAndRemoveRequests({
        communityId: request.communityId,
        memberAddress: request.memberAddress,
        role: CommunityRole.Member
      })

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId: request.communityId,
        memberAddress: request.memberAddress,
        status: ConnectivityStatus.ONLINE
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

    setImmediate(async () => {
      await notifyStakeholdersAboutRequest(
        { ...request, status },
        {
          communityId: community.id,
          communityName: community.name,
          memberAddress: request.memberAddress
        }
      )
    })
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

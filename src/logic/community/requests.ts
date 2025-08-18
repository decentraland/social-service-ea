import { PaginatedParameters } from '@dcl/schemas'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError, InvalidCommunityRequestError } from './errors'
import {
  CommunityPrivacyEnum,
  MemberRequest,
  CommunityRequestStatus,
  CommunityRequestType,
  ICommunityRequestsComponent,
  MemberCommunityRequest
} from './types'

export function createCommunityRequestsComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'communities' | 'logs'>
): ICommunityRequestsComponent {
  const { communitiesDb, communities, logs } = components

  const logger = logs.getLogger('community-requests-component')

  async function createCommunityRequest(
    communityId: string,
    memberAddress: string,
    type: CommunityRequestType
  ): Promise<MemberRequest> {
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

    const existingRequest = await communitiesDb.getCommunityRequests(communityId, {
      pagination: { limit: 1, offset: 0 },
      targetAddress: memberAddress,
      status: CommunityRequestStatus.Pending,
      type
    })

    if (existingRequest.length > 0) {
      throw new InvalidCommunityRequestError(`Request already exists`)
    }

    const request = await communitiesDb.createCommunityRequest(communityId, memberAddress, type)

    logger.info(
      `Created community request: ${type} (${request.id}) for community ${community.name} (${communityId}) for member ${memberAddress}`
    )

    return request
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
    options: { pagination: Required<PaginatedParameters>; type?: CommunityRequestType }
  ): Promise<{ requests: MemberRequest[]; total: number }> {
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

        return {
          ...request,
          ...community
        } as MemberCommunityRequest
      })
      .filter(Boolean) as MemberCommunityRequest[]
  }

  return {
    createCommunityRequest,
    getMemberRequests,
    getCommunityRequests,
    aggregateRequestsWithCommunities
  }
}

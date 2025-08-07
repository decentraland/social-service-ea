import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError, InvalidCommunityRequestError } from './errors'
import {
  CommunityPrivacyEnum,
  CommunityRequest,
  CommunityRequestStatus,
  CommunityRequestType,
  ICommunityRequestsComponent
} from './types'

export function createCommunityRequestsComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'logs'>
): ICommunityRequestsComponent {
  const { communitiesDb, logs } = components

  const logger = logs.getLogger('community-requests-component')

  async function createCommunityRequest(
    communityId: string,
    memberAddress: string,
    type: CommunityRequestType
  ): Promise<CommunityRequest> {
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

  return {
    createCommunityRequest
  }
}

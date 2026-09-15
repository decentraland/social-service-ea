import { CommunityMemberRole, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { normalizeAddress } from '../../../utils/address'
import { GetMemberCommunitiesByIdsRequestBody } from './schemas'
import { InvalidRequestError } from '@dcl/http-commons'

export type GetMemberCommunitiesByIdsResponse = {
  communities: Array<{ id: string; role: CommunityMemberRole }>
}

/**
 * Handler to filter a batch of community IDs down to the ones the address is a member of.
 * This endpoint uses bearer token authentication (admin token) and is intended to be
 * called by other services (like worlds-content-server) that authorize users based on
 * community membership. Only actual memberships are returned, never merely visible communities.
 */
export async function getMemberCommunitiesByIdsHandler(
  context: Pick<
    HandlerContextWithPath<'communitiesDb' | 'logs', '/v1/members/:address/communities'>,
    'components' | 'params' | 'request'
  >
): Promise<HTTPResponse<GetMemberCommunitiesByIdsResponse>> {
  const {
    components: { communitiesDb, logs },
    params: { address: memberAddress },
    request
  } = context
  const logger = logs.getLogger('get-member-communities-by-ids-handler')

  try {
    const normalizedMemberAddress = normalizeAddress(memberAddress)

    const body = (await request.json()) as GetMemberCommunitiesByIdsRequestBody
    const { communityIds } = body

    logger.debug('Getting communities by IDs for member', {
      memberAddress: normalizedMemberAddress,
      communityIdsCount: communityIds.length
    })

    const memberCommunities = await communitiesDb.getMemberCommunitiesByIds(communityIds, normalizedMemberAddress)

    return {
      status: 200,
      body: {
        data: {
          communities: memberCommunities
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting communities by IDs for member ${memberAddress}: ${message}`)

    if (error instanceof InvalidRequestError) {
      throw error
    }

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

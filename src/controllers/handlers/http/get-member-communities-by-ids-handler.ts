import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { normalizeAddress } from '../../../utils/address'
import { GetMemberCommunitiesByIdsRequestBody } from './schemas'

export type GetMemberCommunitiesByIdsResponse = {
  communities: Array<{ id: string }>
}

/**
 * Handler to validate a batch of community IDs and return only those visible to a user.
 * This endpoint uses bearer token authentication (admin token) and is intended to be
 * called by other services (like worlds-content-server) to validate community IDs.
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

    // Get communities that exist and are visible to the user (single DB query)
    const visibleCommunities = await communitiesDb.getVisibleCommunitiesByIds(communityIds, normalizedMemberAddress)

    return {
      status: 200,
      body: {
        data: {
          communities: visibleCommunities
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting communities by IDs for member ${memberAddress}: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

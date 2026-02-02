import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { normalizeAddress } from '../../../utils/address'
import { GetMemberCommunitiesByIdsRequestBody } from './schemas'

export type GetMemberCommunitiesByIdsResponse = {
  communities: Array<{ id: string }>
}

export async function getMemberCommunitiesByIdsHandler(
  context: Pick<
    HandlerContextWithPath<'communitiesDb' | 'logs', '/v1/members/:address/communities'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<GetMemberCommunitiesByIdsResponse>> {
  const {
    components: { communitiesDb, logs },
    params: { address: memberAddress },
    verification,
    request
  } = context
  const logger = logs.getLogger('get-member-communities-by-ids-handler')

  try {
    const userAddress = verification!.auth.toLowerCase()
    const normalizedMemberAddress = normalizeAddress(memberAddress)

    // Users can only get communities for themselves
    if (userAddress !== normalizedMemberAddress) {
      throw new NotAuthorizedError('You are not authorized to get communities for this member')
    }

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

    if (error instanceof NotAuthorizedError) {
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

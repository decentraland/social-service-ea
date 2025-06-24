import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { MemberCommunity } from '../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../utils/pagination'
import { PaginatedResponse } from '@dcl/schemas'
import { normalizeAddress } from '../../utils/address'

export async function getMemberCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communities', '/v1/members/:address/communities'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<MemberCommunity>>> {
  const {
    components: { communities, logs },
    params: { address: memberAddress },
    verification
  } = context
  const logger = logs.getLogger('get-community-members-handler')

  logger.info(`Getting communities that ${memberAddress} is a member of`)

  try {
    const userAddress = verification!.auth.toLowerCase()
    const normalizedMemberAddress = normalizeAddress(memberAddress)
    const pagination = getPaginationParams(context.url.searchParams)

    if (userAddress !== normalizedMemberAddress) {
      throw new NotAuthorizedError('You are not authorized to get communities for this member')
    }

    const { communities: communitiesData, total } = await communities.getMemberCommunities(normalizedMemberAddress, {
      pagination
    })

    return {
      status: 200,
      body: {
        data: {
          results: communitiesData,
          total,
          ...getPaginationResultProperties(total, pagination)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting communities where ${memberAddress} is a member: ${message}`)

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

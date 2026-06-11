import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { MemberCommunity } from '../../../logic/community'
import { getPaginationParams } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { PaginatedResponse } from '@dcl/schemas'
import { normalizeAddress } from '../../../utils/address'

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
  const logger = logs.getLogger('get-member-communities-handler')

  logger.info(`Getting communities that ${memberAddress} is a member of`)

  try {
    const userAddress = verification?.auth ? normalizeAddress(verification.auth) : undefined
    const normalizedMemberAddress = normalizeAddress(memberAddress)
    const pagination = getPaginationParams(context.url.searchParams)

    // Callers other than the member themselves only see publicly visible memberships
    // (public privacy AND listed visibility). The member sees all of their communities.
    const onlyPublicVisible = userAddress !== normalizedMemberAddress

    const { communities: communitiesData, total } = await communities.getMemberCommunities(normalizedMemberAddress, {
      pagination,
      onlyPublicVisible
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

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

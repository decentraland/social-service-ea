import { getPaginationParams } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { CommunityWithUserInformation, CommunityPublicInformation } from '../../logic/community'

export async function getCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityWithUserInformation | CommunityPublicInformation>>> {
  const {
    components: { communities, logs },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-communities-handler')

  logger.info(`Getting communities`)

  const userAddress = verification?.auth.toLowerCase()
  const pagination = getPaginationParams(url.searchParams)
  const search = url.searchParams.get('search')
  const onlyMemberOf = url.searchParams.get('onlyMemberOf')?.toLowerCase() === 'true'

  try {
    const { communities: communitiesData, total } = userAddress
      ? await communities.getCommunities(userAddress, { pagination, search, onlyMemberOf })
      : await communities.getCommunitiesPublicInformation({ pagination, search })

    return {
      status: 200,
      body: {
        data: {
          results: communitiesData,
          total,
          page: Math.floor(pagination.offset / pagination.limit) + 1,
          pages: Math.ceil(total / pagination.limit),
          limit: pagination.limit
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting communities: ${message}`)
    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

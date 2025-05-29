import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { CommunityResult } from '../../logic/community'

export async function getCommunitiesHandler(
  context: Pick<HandlerContextWithPath<'community' | 'logs', '/v1/communities'>, 'components' | 'url' | 'verification'>
): Promise<HTTPResponse<PaginatedResponse<CommunityResult>>> {
  const {
    components: { community, logs },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-communities-handler')

  logger.info(`Getting communities`)
  const userAddress = verification?.auth.toLowerCase()
  const pagination = getPaginationParams(url.searchParams)
  const search = url.searchParams.get('search')

  if (!userAddress) {
    // TODO: we should allow it for discovery reasons
    throw new NotAuthorizedError('User address is required')
  }

  try {
    // TODO: based on the request verification we should get the communities for the user or the public communities
    const { communities, total } = await community.getCommunities(userAddress, {
      pagination,
      search
    })

    return {
      status: 200,
      body: {
        data: {
          results: communities,
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

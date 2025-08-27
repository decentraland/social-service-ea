import { getPaginationParams } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { CommunityForModeration } from '../../../logic/community'
import { FeatureFlag } from '../../../adapters/feature-flags'

export async function getAllCommunitiesForModerationHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs' | 'featureFlags', '/v1/moderation/communities'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityForModeration>>> {
  const {
    components: { communities, logs, featureFlags },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-all-communities-for-moderation-handler')

  logger.info(`Getting all communities for moderation`)

  const userAddress = verification!.auth.toLowerCase()

  try {
    const globalModerators = (await featureFlags.getVariants<string[]>(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)) || []

    if (!globalModerators.includes(userAddress)) {
      return {
        status: 403,
        body: {
          message: 'Access denied. Global moderator privileges required.'
        }
      }
    }

    const pagination = getPaginationParams(url.searchParams)
    const search = url.searchParams.get('search')

    const { communities: communitiesData, total } = await communities.getAllCommunitiesForModeration({
      pagination,
      search
    })

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
    logger.error(`Error getting communities for moderation: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}

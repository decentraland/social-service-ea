import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  CommunityNotFoundError,
  CommunityOwnerNotFoundError,
  AggregatedCommunityWithMemberData
} from '../../../logic/community'
import { NotAuthorizedError } from '@dcl/platform-server-commons'

export async function getCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'config' | 'communities', '/v1/communities/:id'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<AggregatedCommunityWithMemberData>> {
  const {
    components: { communities, logs, config },
    params: { id },
    verification,
    request
  } = context
  const logger = logs.getLogger('get-community-handler')
  const API_ADMIN_TOKEN = await config.getString('API_ADMIN_TOKEN')

  logger.info(`Getting community: ${id}`)

  try {
    const userAddress: string | undefined = verification?.auth?.toLowerCase()
    const optionalAuthHeader = request.headers.get('Authorization')
    const isAdmin = !!(API_ADMIN_TOKEN && optionalAuthHeader === `Bearer ${API_ADMIN_TOKEN}`)

    if (!isAdmin && !userAddress) {
      throw new NotAuthorizedError('This endpoint requires a signed fetch request. See ADR-44.')
    }

    return {
      status: 200,
      body: {
        data: await communities.getCommunity(id, {
          as: userAddress
        })
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community: ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof CommunityOwnerNotFoundError) {
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

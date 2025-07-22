import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  CommunityNotFoundError,
  CommunityOwnerNotFoundError,
  AggregatedCommunityWithMemberData
} from '../../../logic/community'

export async function getCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communities', '/v1/communities/:id'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<AggregatedCommunityWithMemberData>> {
  const {
    components: { communities, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('get-community-handler')

  logger.info(`Getting community: ${id}`)

  try {
    const userAddress = verification!.auth.toLowerCase()

    return {
      status: 200,
      body: {
        data: await communities.getCommunity(id, userAddress)
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

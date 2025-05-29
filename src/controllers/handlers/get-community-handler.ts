import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError, CommunityWithMembersCount } from '../../logic/community'

export async function getCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'community', '/communities/:id'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<CommunityWithMembersCount>> {
  const {
    components: { community, logs },
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
        data: await community.getCommunity(id, userAddress)
      }
    }
  } catch (error) {
    const message = messageErrorOrUnknown(error)
    logger.error(`Error getting community: ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError) {
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

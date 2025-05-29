import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'

export async function deleteCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'community' | 'logs', '/communities/:id'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('delete-community-handler')

  logger.info(`Deleting community: ${id}`)

  try {
    const userAddress = verification!.auth.toLowerCase()

    await community.deleteCommunity(id, userAddress)

    return {
      status: 204
    }
  } catch (error) {
    const message = messageErrorOrUnknown(error)

    logger.error(`Error deleting community: ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof NotAuthorizedError) {
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

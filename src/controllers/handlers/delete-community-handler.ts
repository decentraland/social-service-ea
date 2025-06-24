import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'

export async function deleteCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities/:id'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communities, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('delete-community-handler')

  logger.info(`Deleting community: ${id}`)

  try {
    const userAddress = verification!.auth.toLowerCase()

    await communities.deleteCommunity(id, userAddress)

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)

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
